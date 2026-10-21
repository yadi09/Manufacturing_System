// Package auth handles email and password sign-in, sessions and permissions.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
	"github.com/yadi09/Manufacturing_System/backend/internal/settings"
)

const SessionLifetime = 12 * time.Hour

var (
	ErrInvalidCredentials = errors.New("auth: invalid email or password")
	ErrNoSession          = errors.New("auth: no valid session")
	ErrLockedOut          = errors.New("auth: too many failed attempts")
	ErrEmailTaken         = errors.New("auth: email already in use")
	ErrWeakPassword       = fmt.Errorf("auth: password must be at least %d characters", MinPasswordLength)
	ErrInvalidEmail       = errors.New("auth: invalid email address")
)

type Role struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
}

// User is the signed-in person with their roles and the permissions those roles grant.
type User struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	FullName string `json:"full_name"`
	// MustChangePassword is true after a new user or a reset: the API allows only changing the
	// password (and reading /me, signing out) until it is done.
	MustChangePassword bool     `json:"must_change_password"`
	Roles              []Role   `json:"roles"`
	Permissions        []string `json:"permissions"`
	// Preferences are the person's saved display choices; a nil field means not chosen yet.
	Preferences Preferences `json:"preferences"`
}

// Preferences are per person and saved on the server. Display only.
type Preferences struct {
	Language *string `json:"language"` // "en" or "am"
	Calendar *string `json:"calendar"` // "ethiopian" or "gregorian"
}

func (u User) Can(permission string) bool {
	for _, p := range u.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// LockedError says how long until another attempt is allowed.
type LockedError struct{ RetryAfter time.Duration }

func (e *LockedError) Error() string   { return ErrLockedOut.Error() }
func (e *LockedError) Is(t error) bool { return t == ErrLockedOut }

type Service struct {
	pool     *pgxpool.Pool
	settings *settings.Store
	now      func() time.Time
	// dummyHash is verified when the email is unknown, so timing does not reveal which emails exist.
	dummyHash string
}

func NewService(pool *pgxpool.Pool) *Service {
	h, _ := HashPassword("dummy-password-for-timing")
	return &Service{pool: pool, settings: settings.New(pool), now: time.Now, dummyHash: h}
}

func normalizeEmail(e string) (string, error) {
	e = strings.ToLower(strings.TrimSpace(e))
	if a, err := mail.ParseAddress(e); err != nil || a.Address != e {
		return "", ErrInvalidEmail
	}
	return e, nil
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

func uuidString(u pgtype.UUID) string {
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// CreateUser adds an active user with the given role keys and audits it.
// CreateUser adds an active user. mustChange makes them choose a new password at first sign-in;
// use true whenever someone other than the user chose the password.
func (s *Service) CreateUser(ctx context.Context, actor, email, fullName, password string, roleKeys []string, mustChange bool) (User, error) {
	email, err := normalizeEmail(email)
	if err != nil {
		return User{}, err
	}
	if len(password) < MinPasswordLength {
		return User{}, ErrWeakPassword
	}
	hash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := db.New(tx)

	row, err := q.CreateUser(ctx, db.CreateUserParams{Email: email, FullName: fullName, PasswordHash: hash, MustChangePassword: mustChange})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	for _, key := range roleKeys {
		if err := q.AssignRole(ctx, db.AssignRoleParams{UserID: row.ID, RoleKey: key}); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23503" {
				return User{}, fmt.Errorf("%w: %q", ErrUnknownRole, key)
			}
			return User{}, fmt.Errorf("assign role %q: %w", key, err)
		}
	}
	newVal := fmt.Sprintf(`{"email":%q,"roles":%q,"must_change_password":%t}`, email, strings.Join(roleKeys, ","), mustChange)
	if _, err := q.InsertAudit(ctx, db.InsertAuditParams{
		Actor: actor, Action: "create", Entity: "users", EntityID: uuidString(row.ID), NewValue: []byte(newVal),
	}); err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return s.loadUser(ctx, db.New(s.pool), row.ID, email, fullName, mustChange)
}

func (s *Service) loadUser(ctx context.Context, q *db.Queries, id pgtype.UUID, email, fullName string, mustChange bool) (User, error) {
	roles, err := q.ListUserRoles(ctx, id)
	if err != nil {
		return User{}, err
	}
	perms, err := q.ListUserPermissions(ctx, id)
	if err != nil {
		return User{}, err
	}
	prefs, err := q.GetUserPreferences(ctx, id)
	if err != nil {
		return User{}, err
	}
	u := User{ID: uuidString(id), Email: email, FullName: fullName, MustChangePassword: mustChange, Roles: []Role{}, Permissions: perms,
		Preferences: Preferences{Language: textPtr(prefs.Language), Calendar: textPtr(prefs.Calendar)}}
	if u.Permissions == nil {
		u.Permissions = []string{}
	}
	for _, r := range roles {
		u.Roles = append(u.Roles, Role{Key: r.Key, Name: r.Name, NameAm: r.NameAm})
	}
	return u, nil
}

// Login checks the credentials and starts a session. The returned token goes in the cookie;
// only its hash is stored. Success and failure are both written to the audit log.
func (s *Service) Login(ctx context.Context, email, password string) (token string, user User, err error) {
	q := db.New(s.pool)
	email = strings.ToLower(strings.TrimSpace(email))
	if err := s.checkLockout(ctx, q, email); err != nil {
		return "", User{}, err
	}
	row, lookupErr := q.GetUserByEmail(ctx, email)
	hash := s.dummyHash
	if lookupErr == nil {
		hash = row.PasswordHash
	} else if !errors.Is(lookupErr, pgx.ErrNoRows) {
		return "", User{}, lookupErr
	}
	ok := VerifyPassword(password, hash) && lookupErr == nil && row.Active
	if !ok {
		s.audit(ctx, q, email, "login_failed", email)
		return "", User{}, ErrInvalidCredentials
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", User{}, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	if err := q.CreateSession(ctx, db.CreateSessionParams{
		TokenHash: hashToken(token), UserID: row.ID,
		ExpiresAt: pgtype.Timestamptz{Time: s.now().Add(SessionLifetime), Valid: true},
	}); err != nil {
		return "", User{}, err
	}
	s.audit(ctx, q, email, "login", uuidString(row.ID))
	user, err = s.loadUser(ctx, q, row.ID, row.Email, row.FullName, row.MustChangePassword)
	return token, user, err
}

func (s *Service) audit(ctx context.Context, q *db.Queries, actor, action, entityID string) {
	_, _ = q.InsertAudit(ctx, db.InsertAuditParams{Actor: actor, Action: action, Entity: "auth", EntityID: entityID})
}

// Authenticate returns the user for a session token, or ErrNoSession.
func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, ErrNoSession
	}
	q := db.New(s.pool)
	row, err := q.GetSessionUser(ctx, hashToken(token))
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !row.Active) {
		return User{}, ErrNoSession
	}
	if err != nil {
		return User{}, err
	}
	return s.loadUser(ctx, q, row.ID, row.Email, row.FullName, row.MustChangePassword)
}

// Logout ends the session. Unknown tokens are ignored.
func (s *Service) Logout(ctx context.Context, token string) error {
	return db.New(s.pool).DeleteSession(ctx, hashToken(token))
}

// checkLockout blocks an email once it has max failed logins inside the window (both are
// settings). It counts unknown emails the same way, so it reveals nothing about which exist.
// Attempts made while locked are rejected before the password is checked and are not
// recorded, so an attacker cannot keep someone locked out for longer than the window.
func (s *Service) checkLockout(ctx context.Context, q *db.Queries, email string) error {
	maxAttempts, err := s.settings.Int(ctx, settings.KeyLoginMaxAttempts, 5)
	if err != nil {
		return err
	}
	mins, err := s.settings.Int(ctx, settings.KeyLoginLockoutMins, 15)
	if err != nil {
		return err
	}
	window := time.Duration(mins) * time.Minute
	fails, err := q.RecentFailedLogins(ctx, db.RecentFailedLoginsParams{Email: email, WindowSecs: int32(window.Seconds()), MaxRows: int32(maxAttempts)})
	if err != nil {
		return err
	}
	if len(fails) < maxAttempts {
		return nil
	}
	retry := fails[len(fails)-1].Time.Add(window).Sub(s.now())
	if retry < time.Second {
		retry = time.Second
	}
	return &LockedError{RetryAfter: retry}
}
