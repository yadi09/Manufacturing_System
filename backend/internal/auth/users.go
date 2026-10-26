package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
)

var (
	ErrUserNotFound      = errors.New("auth: user not found")
	ErrLastAdmin         = errors.New("auth: at least one active user must keep the users.manage permission")
	ErrWrongPassword     = errors.New("auth: current password is wrong")
	ErrUnknownRole       = errors.New("auth: unknown role")
	ErrPasswordUnchanged = errors.New("auth: the new password must be different from the current one")
)

// lockUserAdmin serializes changes that could remove the last administrator.
const lockUserAdmin = 4_2_0_1

type UserSummary struct {
	ID                 string   `json:"id"`
	Email              string   `json:"email"`
	FullName           string   `json:"full_name"`
	Active             bool     `json:"active"`
	MustChangePassword bool     `json:"must_change_password"`
	Roles              []string `json:"roles"`
}

// RoleInfo carries names and the one-line description in both languages; they are data, not code.
type RoleInfo struct {
	Key           string   `json:"key"`
	Name          string   `json:"name"`
	NameAm        string   `json:"name_am"`
	Description   string   `json:"description"`
	DescriptionAm string   `json:"description_am"`
	Permissions   []string `json:"permissions"`
}

// UserUpdate changes only the fields that are set.
type UserUpdate struct {
	FullName *string   `json:"full_name"`
	Active   *bool     `json:"active"`
	Roles    *[]string `json:"roles"`
}

func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return u, ErrUserNotFound
	}
	return u, nil
}

func (s *Service) ListUsers(ctx context.Context) ([]UserSummary, error) {
	q := db.New(s.pool)
	users, err := q.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	pairs, err := q.ListAllUserRoles(ctx)
	if err != nil {
		return nil, err
	}
	roles := map[string][]string{}
	for _, p := range pairs {
		roles[uuidString(p.UserID)] = append(roles[uuidString(p.UserID)], p.RoleKey)
	}
	out := make([]UserSummary, 0, len(users))
	for _, u := range users {
		id := uuidString(u.ID)
		r := roles[id]
		if r == nil {
			r = []string{}
		}
		out = append(out, UserSummary{ID: id, Email: u.Email, FullName: u.FullName, Active: u.Active, MustChangePassword: u.MustChangePassword, Roles: r})
	}
	return out, nil
}

func (s *Service) ListRoles(ctx context.Context) ([]RoleInfo, error) {
	rows, err := db.New(s.pool).ListRolesWithPermissions(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]RoleInfo, 0, len(rows))
	for _, r := range rows {
		out = append(out, RoleInfo{Key: r.Key, Name: r.Name, NameAm: r.NameAm, Description: r.Description, DescriptionAm: r.DescriptionAm, Permissions: r.Permissions})
	}
	return out, nil
}

func toJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// UpdateUser changes name, active flag and roles in one transaction and audits old and new
// values. Deactivating a user ends their sessions. It refuses a change that would leave no
// active user able to manage users.
func (s *Service) UpdateUser(ctx context.Context, actor, id string, in UserUpdate) error {
	uid, err := parseUUID(id)
	if err != nil {
		return err
	}
	if in.Roles != nil {
		known, err := s.ListRoles(ctx)
		if err != nil {
			return err
		}
		for _, k := range *in.Roles {
			if !slices.ContainsFunc(known, func(r RoleInfo) bool { return r.Key == k }) {
				return fmt.Errorf("%w: %q", ErrUnknownRole, k)
			}
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockUserAdmin); err != nil {
		return err
	}
	q := db.New(tx)

	cur, err := q.GetUserByID(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUserNotFound
	}
	if err != nil {
		return err
	}
	curRoles, err := q.ListUserRoles(ctx, uid)
	if err != nil {
		return err
	}
	oldKeys := []string{}
	for _, r := range curRoles {
		oldKeys = append(oldKeys, r.Key)
	}
	name, active, keys := cur.FullName, cur.Active, oldKeys
	if in.FullName != nil {
		name = *in.FullName
	}
	if in.Active != nil {
		active = *in.Active
	}
	if in.Roles != nil {
		keys = slices.Clone(*in.Roles)
	}
	if err := q.UpdateUserProfile(ctx, db.UpdateUserProfileParams{ID: uid, FullName: name, Active: active}); err != nil {
		return err
	}
	if in.Roles != nil {
		if err := q.DeleteUserRoles(ctx, uid); err != nil {
			return err
		}
		for _, k := range keys {
			if err := q.AssignRole(ctx, db.AssignRoleParams{UserID: uid, RoleKey: k}); err != nil {
				return err
			}
		}
	}
	if !active {
		if err := q.DeleteUserSessions(ctx, uid); err != nil {
			return err
		}
	}
	if n, err := q.CountActiveUserManagers(ctx); err != nil {
		return err
	} else if n == 0 {
		return ErrLastAdmin
	}
	// One audit row per kind of change, each with the old and new value, so the log reads
	// "deactivated", "roles changed" and so on instead of one blob.
	audit := func(action string, oldV, newV any) error {
		_, err := q.InsertAudit(ctx, db.InsertAuditParams{Actor: actor, Action: action, Entity: "users", EntityID: id, OldValue: toJSON(oldV), NewValue: toJSON(newV)})
		return err
	}
	if name != cur.FullName {
		if err := audit("rename", map[string]any{"full_name": cur.FullName}, map[string]any{"full_name": name}); err != nil {
			return err
		}
	}
	if active != cur.Active {
		action := "deactivate"
		if active {
			action = "reactivate"
		}
		if err := audit(action, map[string]any{"active": cur.Active}, map[string]any{"active": active}); err != nil {
			return err
		}
	}
	if in.Roles != nil {
		slices.Sort(oldKeys)
		slices.Sort(keys)
		if !slices.Equal(oldKeys, keys) {
			if err := audit("roles_change", map[string]any{"roles": oldKeys}, map[string]any{"roles": keys}); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

// ResetPassword sets a new password for a user (administrator action) and ends all their sessions.
func (s *Service) ResetPassword(ctx context.Context, actor, id, newPassword string) error {
	uid, err := parseUUID(id)
	if err != nil {
		return err
	}
	return s.setPassword(ctx, actor, uid, newPassword, "password_reset", nil, true)
}

// ChangePassword lets a user change their own password. Their other sessions end; the one in use stays.
func (s *Service) ChangePassword(ctx context.Context, userID, currentToken, current, newPassword string) error {
	uid, err := parseUUID(userID)
	if err != nil {
		return err
	}
	row, err := db.New(s.pool).GetUserByID(ctx, uid)
	if err != nil {
		return err
	}
	if !VerifyPassword(current, row.PasswordHash) {
		return ErrWrongPassword
	}
	if VerifyPassword(newPassword, row.PasswordHash) {
		return ErrPasswordUnchanged
	}
	keep := hashToken(currentToken)
	return s.setPassword(ctx, row.Email, uid, newPassword, "password_change", keep, false)
}

func (s *Service) setPassword(ctx context.Context, actor string, uid pgtype.UUID, newPassword, action string, keepSession []byte, mustChange bool) error {
	if len(newPassword) < MinPasswordLength {
		return ErrWeakPassword
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := db.New(tx)
	cur, err := q.GetUserByID(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUserNotFound
	}
	if err != nil {
		return err
	}
	if err := q.UpdatePasswordHash(ctx, db.UpdatePasswordHashParams{ID: uid, PasswordHash: hash, MustChangePassword: mustChange}); err != nil {
		return err
	}
	if keepSession != nil {
		err = q.DeleteOtherUserSessions(ctx, db.DeleteOtherUserSessionsParams{UserID: uid, TokenHash: keepSession})
	} else {
		err = q.DeleteUserSessions(ctx, uid)
	}
	if err != nil {
		return err
	}
	// The audit row records that it happened and the flag change, never the password or its hash.
	if _, err := q.InsertAudit(ctx, db.InsertAuditParams{Actor: actor, Action: action, Entity: "users", EntityID: uuidString(uid),
		OldValue: toJSON(map[string]any{"must_change_password": cur.MustChangePassword}), NewValue: toJSON(map[string]any{"must_change_password": mustChange})}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
