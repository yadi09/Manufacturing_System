package settings_test

import (
	"context"
	"testing"

	"github.com/yadi09/Manufacturing_System/backend/internal/settings"
	"github.com/yadi09/Manufacturing_System/backend/internal/testdb"
)

func TestDisplayTimeZone_DefaultComesFromMigration(t *testing.T) {
	s := settings.New(testdb.New(t))
	loc, err := s.DisplayLocation(context.Background())
	if err != nil || loc.String() != "Africa/Addis_Ababa" {
		t.Fatalf("got %v, %v", loc, err)
	}
}

func TestSetString_ChangesValueAndWritesAudit(t *testing.T) {
	pool := testdb.New(t)
	s := settings.New(pool)
	ctx := context.Background()

	if err := s.SetString(ctx, "admin", settings.KeyDisplayTimeZone, "UTC", "testing"); err != nil {
		t.Fatal(err)
	}
	if loc, _ := s.DisplayLocation(ctx); loc.String() != "UTC" {
		t.Fatalf("zone = %v, want UTC", loc)
	}
	var actor, oldV, newV, reason string
	err := pool.QueryRow(ctx, `SELECT actor, old_value::text, new_value::text, reason FROM audit_log WHERE entity_id = $1`,
		settings.KeyDisplayTimeZone).Scan(&actor, &oldV, &newV, &reason)
	if err != nil {
		t.Fatal(err)
	}
	if actor != "admin" || oldV != `"Africa/Addis_Ababa"` || newV != `"UTC"` || reason != "testing" {
		t.Fatalf("audit row = %s %s %s %s", actor, oldV, newV, reason)
	}
}

func TestSetString_RejectsInvalidTimeZone(t *testing.T) {
	s := settings.New(testdb.New(t))
	if err := s.SetString(context.Background(), "admin", settings.KeyDisplayTimeZone, "Mars/Olympus", ""); err == nil {
		t.Fatal("invalid zone should be rejected")
	}
}
