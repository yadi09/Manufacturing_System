package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
)

var ErrInvalidPreference = errors.New("auth: invalid preference")

// PreferencesUpdate changes only the fields that are set.
type PreferencesUpdate struct {
	Language *string `json:"language"`
	Calendar *string `json:"calendar"`
}

func (u PreferencesUpdate) validate() error {
	if u.Language != nil && *u.Language != "en" && *u.Language != "am" {
		return ErrInvalidPreference
	}
	if u.Calendar != nil && *u.Calendar != "ethiopian" && *u.Calendar != "gregorian" {
		return ErrInvalidPreference
	}
	return nil
}

func text(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

// SetPreferences saves the signed-in person's own display choices. They are not business
// overrides, so they are not written to the audit log.
func (s *Service) SetPreferences(ctx context.Context, userID string, in PreferencesUpdate) error {
	if err := in.validate(); err != nil {
		return err
	}
	uid, err := parseUUID(userID)
	if err != nil {
		return err
	}
	return db.New(s.pool).UpdateUserPreferences(ctx, db.UpdateUserPreferencesParams{ID: uid, Language: text(in.Language), Calendar: text(in.Calendar)})
}
