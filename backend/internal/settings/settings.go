// Package settings reads and changes business settings. Every change is
// written to the append-only audit log in the same transaction.
package settings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yadi09/Manufacturing_System/backend/internal/calendar"
	"github.com/yadi09/Manufacturing_System/backend/internal/db"
)

const (
	KeyDisplayTimeZone  = "display_time_zone"
	KeyLoginMaxAttempts = "login_max_attempts"
	KeyLoginLockoutMins = "login_lockout_minutes"
	KeyBomWarnPct       = "bom_warn_pct"
	KeyBomCritPct       = "bom_crit_pct"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// String returns a string setting, or "" when it is not set.
func (s *Store) String(ctx context.Context, key string) (string, error) {
	row, err := db.New(s.pool).GetSetting(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var v string
	if err := json.Unmarshal(row.Value, &v); err != nil {
		return "", fmt.Errorf("setting %s is not a string: %w", key, err)
	}
	return v, nil
}

// DisplayLocation is the time zone dates are shown in. Display only; storage stays UTC.
func (s *Store) DisplayLocation(ctx context.Context) (*time.Location, error) {
	name, err := s.String(ctx, KeyDisplayTimeZone)
	if err != nil {
		return nil, err
	}
	return calendar.LoadZone(name) // empty falls back to Africa/Addis_Ababa
}

// SetString changes a string setting and audits it (actor, old and new value, reason).
func (s *Store) SetString(ctx context.Context, actor, key, value, reason string) error {
	if key == KeyDisplayTimeZone {
		if _, err := time.LoadLocation(value); err != nil || value == "" {
			return fmt.Errorf("settings: %q is not a valid time zone", value)
		}
	}
	newJSON, _ := json.Marshal(value)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := db.New(tx)

	var oldJSON []byte
	if row, err := q.GetSetting(ctx, key); err == nil {
		oldJSON = row.Value
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if _, err := q.UpsertSetting(ctx, db.UpsertSettingParams{Key: key, Value: newJSON}); err != nil {
		return err
	}
	if _, err := q.InsertAudit(ctx, db.InsertAuditParams{
		Actor: actor, Action: "update", Entity: "settings", EntityID: key,
		OldValue: oldJSON, NewValue: newJSON, Reason: pgtype.Text{String: reason, Valid: reason != ""},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Int returns an integer setting, or def when it is missing or not a positive number.
func (s *Store) Int(ctx context.Context, key string, def int) (int, error) {
	row, err := db.New(s.pool).GetSetting(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return def, nil
	}
	if err != nil {
		return 0, err
	}
	var v int
	if err := json.Unmarshal(row.Value, &v); err != nil || v <= 0 {
		return def, nil
	}
	return v, nil
}
