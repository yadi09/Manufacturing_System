package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
	"github.com/yadi09/Manufacturing_System/backend/internal/httpapi"
	"github.com/yadi09/Manufacturing_System/backend/internal/testdb"
)

func TestHealthz_DatabaseUp(t *testing.T) {
	pool := testdb.New(t)
	rec := httptest.NewRecorder()
	httpapi.NewRouter(httpapi.Deps{DB: pool}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" || body["database"] != "up" {
		t.Fatalf("body = %v", body)
	}
}

func TestMigration_SettingsUpsertAndAuditAppendOnly(t *testing.T) {
	pool := testdb.New(t)
	ctx := context.Background()
	q := db.New(pool)

	if _, err := q.UpsertSetting(ctx, db.UpsertSettingParams{Key: "rest_interval_minutes", Value: []byte(`60`)}); err != nil {
		t.Fatal(err)
	}
	s, err := q.UpsertSetting(ctx, db.UpsertSettingParams{Key: "rest_interval_minutes", Value: []byte(`90`)})
	if err != nil {
		t.Fatal(err)
	}
	if string(s.Value) != "90" {
		t.Fatalf("value = %s, want 90", s.Value)
	}

	a, err := q.InsertAudit(ctx, db.InsertAuditParams{
		Actor: "tester", Action: "update", Entity: "settings", EntityID: "rest_interval_minutes",
		OldValue: []byte(`60`), NewValue: []byte(`90`),
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = pool.Exec(ctx, "UPDATE audit_log SET actor = 'x' WHERE id = $1", a.ID)
	if err == nil || !strings.Contains(err.Error(), "append-only") {
		t.Fatalf("update on audit_log should be rejected, got %v", err)
	}
	if _, err = pool.Exec(ctx, "DELETE FROM audit_log WHERE id = $1", a.ID); err == nil {
		t.Fatal("delete on audit_log should be rejected")
	}
}
