package settings

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
)

const KeyRestRotationMins = "rest_rotation_minutes"

// InvalidError names the setting whose new value was refused, and why.
type InvalidError struct{ Key, Code string }

func (e *InvalidError) Error() string { return "settings: " + e.Key + ": " + e.Code }

// editable lists the settings the settings screen may change, with their defaults and limits.
// A milestone adds its own settings here when its part of the system is built.
var editable = map[string]struct {
	text     bool // a string; otherwise a whole number between min and max
	min, max int
	def      any
}{
	KeyDisplayTimeZone:  {text: true, def: "Africa/Addis_Ababa"},
	KeyLoginMaxAttempts: {min: 1, max: 50, def: 5},
	KeyLoginLockoutMins: {min: 1, max: 1440, def: 15},
	KeyRestRotationMins: {min: 5, max: 720, def: 60},
	KeyBomWarnPct:       {min: 1, max: 100, def: 5},
	KeyBomCritPct:       {min: 1, max: 100, def: 10},
}

// Editable returns every setting the settings screen shows, with its current value.
func (s *Store) Editable(ctx context.Context) (map[string]any, error) {
	q := db.New(s.pool)
	out := map[string]any{}
	for key, spec := range editable {
		out[key] = spec.def
		row, err := q.GetSetting(ctx, key)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, err
		}
		var v any
		if spec.text {
			var str string
			if json.Unmarshal(row.Value, &str) == nil {
				v = str
			}
		} else {
			var n int
			if json.Unmarshal(row.Value, &n) == nil {
				v = n
			}
		}
		if v != nil {
			out[key] = v
		}
	}
	return out, nil
}

// Update changes several settings at once, all or none, and writes one audit row per changed key
// (who, when, old and new value). The recipe warning tolerance must stay below the critical one.
func (s *Store) Update(ctx context.Context, actor string, changes map[string]json.RawMessage) (map[string]any, error) {
	current, err := s.Editable(ctx)
	if err != nil {
		return nil, err
	}
	next := map[string]any{}
	for k, v := range current {
		next[k] = v
	}
	keys := make([]string, 0, len(changes))
	for k := range changes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		spec, ok := editable[key]
		if !ok {
			return nil, &InvalidError{Key: key, Code: "unknown_setting"}
		}
		if spec.text {
			var str string
			if json.Unmarshal(changes[key], &str) != nil || str == "" {
				return nil, &InvalidError{Key: key, Code: "invalid_value"}
			}
			if key == KeyDisplayTimeZone {
				if _, err := time.LoadLocation(str); err != nil {
					return nil, &InvalidError{Key: key, Code: "invalid_time_zone"}
				}
			}
			next[key] = str
			continue
		}
		var n int
		if json.Unmarshal(changes[key], &n) != nil || n < spec.min || n > spec.max {
			return nil, &InvalidError{Key: key, Code: "out_of_range"}
		}
		next[key] = n
	}
	if next[KeyBomWarnPct].(int) >= next[KeyBomCritPct].(int) {
		return nil, &InvalidError{Key: KeyBomWarnPct, Code: "tolerance_order"}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := db.New(tx)
	for _, key := range keys {
		if next[key] == current[key] {
			continue
		}
		oldJSON, _ := json.Marshal(current[key])
		newJSON, _ := json.Marshal(next[key])
		if _, err := q.UpsertSetting(ctx, db.UpsertSettingParams{Key: key, Value: newJSON}); err != nil {
			return nil, err
		}
		if _, err := q.InsertAudit(ctx, db.InsertAuditParams{Actor: actor, Action: "update", Entity: "settings", EntityID: key, OldValue: oldJSON, NewValue: newJSON, Reason: pgtype.Text{}}); err != nil {
			return nil, err
		}
	}
	return next, tx.Commit(ctx)
}
