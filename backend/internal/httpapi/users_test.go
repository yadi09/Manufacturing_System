package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
)

// signIn creates a user with the roles and returns their session cookie and id.
func signIn(t *testing.T, e env, email string, roles ...string) (*http.Cookie, string) {
	t.Helper()
	e.mustUser(t, email, roles...)
	rec := login(e, email, pw)
	var u struct{ ID string }
	if err := json.Unmarshal(rec.Body.Bytes(), &u); err != nil {
		t.Fatal(err)
	}
	return sessionOf(t, rec), u.ID
}

func TestUsersAPI_OnlyForUserManagers(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	cash, _ := signIn(t, e, "cash@crown.example", "cashier")

	for _, path := range []string{"/api/users", "/api/roles"} {
		if rec := e.do("GET", path, "", nil); rec.Code != 401 {
			t.Errorf("%s anonymous = %d", path, rec.Code)
		}
		if rec := e.do("GET", path, "", cash); rec.Code != 403 {
			t.Errorf("%s cashier = %d", path, rec.Code)
		}
		if rec := e.do("GET", path, "", admin); rec.Code != 200 {
			t.Errorf("%s admin = %d", path, rec.Code)
		}
	}
	if rec := e.do("POST", "/api/users", `{"email":"x@crown.example","full_name":"X","password":"`+pw+`","roles":[]}`, cash); rec.Code != 403 {
		t.Errorf("cashier create = %d", rec.Code)
	}
}

func TestUsersAPI_CreateListAndAudit(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")

	rec := e.do("POST", "/api/users", `{"email":"New@Crown.example","full_name":"New Person","password":"`+pw+`","roles":["purchaser","qc_inspector"]}`, admin)
	if rec.Code != 201 {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	if dup := e.do("POST", "/api/users", `{"email":"new@crown.example","full_name":"Dup","password":"`+pw+`","roles":[]}`, admin); dup.Code != 409 || !strings.Contains(dup.Body.String(), "email_taken") {
		t.Fatalf("duplicate = %d %s", dup.Code, dup.Body)
	}
	if weak := e.do("POST", "/api/users", `{"email":"w@crown.example","full_name":"W","password":"short","roles":[]}`, admin); weak.Code != 422 {
		t.Fatalf("weak = %d", weak.Code)
	}
	if bad := e.do("POST", "/api/users", `{"email":"r@crown.example","full_name":"R","password":"`+pw+`","roles":["nope"]}`, admin); bad.Code != 422 {
		t.Fatalf("unknown role = %d", bad.Code)
	}
	list := e.do("GET", "/api/users", "", admin)
	if !strings.Contains(list.Body.String(), `"email":"new@crown.example"`) || strings.Contains(list.Body.String(), "argon2") {
		t.Fatalf("list = %s", list.Body)
	}
	var actor string
	if err := e.pool.QueryRow(context.Background(), `SELECT actor FROM audit_log WHERE entity = 'users' AND new_value::text LIKE '%new@crown.example%'`).Scan(&actor); err != nil || actor != "admin@crown.example" {
		t.Fatalf("audit actor = %q, %v", actor, err)
	}
}

func TestUsersAPI_UpdateRolesAndDeactivate(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	worker, workerID := signIn(t, e, "w@crown.example", "purchaser")

	patch := e.do("PATCH", "/api/users/"+workerID, `{"roles":["qc_inspector","owner"],"full_name":"Renamed"}`, admin)
	if patch.Code != 204 {
		t.Fatalf("patch = %d %s", patch.Code, patch.Body)
	}
	me := e.do("GET", "/api/auth/me", "", worker)
	if !strings.Contains(me.Body.String(), `"key":"owner"`) || strings.Contains(me.Body.String(), `"key":"purchaser"`) || !strings.Contains(me.Body.String(), "Renamed") {
		t.Fatalf("roles not applied: %s", me.Body)
	}
	var oldV, newV string
	err := e.pool.QueryRow(context.Background(), `SELECT old_value::text, new_value::text FROM audit_log WHERE action = 'roles_change' AND entity = 'users'`).Scan(&oldV, &newV)
	if err != nil || !strings.Contains(oldV, "purchaser") || !strings.Contains(newV, "owner") {
		t.Fatalf("audit old/new = %s | %s | %v", oldV, newV, err)
	}

	if off := e.do("PATCH", "/api/users/"+workerID, `{"active":false}`, admin); off.Code != 204 {
		t.Fatalf("deactivate = %d", off.Code)
	}
	if rec := e.do("GET", "/api/auth/me", "", worker); rec.Code != 401 {
		t.Fatalf("deactivation must end sessions: %d", rec.Code)
	}
	if rec := login(e, "w@crown.example", pw); rec.Code != 401 {
		t.Fatalf("deactivated login = %d", rec.Code)
	}
	if nf := e.do("PATCH", "/api/users/not-a-uuid", `{"active":false}`, admin); nf.Code != 404 {
		t.Fatalf("bad id = %d", nf.Code)
	}
	if bad := e.do("PATCH", "/api/users/"+workerID, `{"roles":["nope"]}`, admin); bad.Code != 422 {
		t.Fatalf("unknown role = %d", bad.Code)
	}
}

func TestUsersAPI_LastAdminIsProtected(t *testing.T) {
	e := setup(t)
	admin, adminID := signIn(t, e, "admin@crown.example", "admin")

	for _, body := range []string{`{"active":false}`, `{"roles":["cashier"]}`, `{"roles":[]}`} {
		rec := e.do("PATCH", "/api/users/"+adminID, body, admin)
		if rec.Code != 409 || !strings.Contains(rec.Body.String(), "last_admin") {
			t.Fatalf("%s = %d %s", body, rec.Code, rec.Body)
		}
	}
	if rec := e.do("GET", "/api/auth/me", "", admin); rec.Code != 200 {
		t.Fatal("admin must still be signed in")
	}
	// With a second administrator the first may step down.
	_, secondID := signIn(t, e, "admin2@crown.example", "admin")
	if rec := e.do("PATCH", "/api/users/"+adminID, `{"roles":["cashier"]}`, admin); rec.Code != 204 {
		t.Fatalf("step down with a second admin = %d", rec.Code)
	}
	_ = secondID
}

func TestPasswords_AdminResetEndsSessions(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	worker, workerID := signIn(t, e, "w@crown.example", "purchaser")

	if rec := e.do("POST", "/api/users/"+workerID+"/password", `{"password":"short"}`, admin); rec.Code != 422 {
		t.Fatalf("weak = %d", rec.Code)
	}
	if rec := e.do("POST", "/api/users/"+workerID+"/password", `{"password":"brand new password"}`, admin); rec.Code != 204 {
		t.Fatalf("reset = %d", rec.Code)
	}
	if rec := e.do("GET", "/api/auth/me", "", worker); rec.Code != 401 {
		t.Fatalf("old session survives reset: %d", rec.Code)
	}
	if rec := login(e, "w@crown.example", pw); rec.Code != 401 {
		t.Fatal("old password still works")
	}
	if rec := login(e, "w@crown.example", "brand new password"); rec.Code != 200 {
		t.Fatalf("new password = %d", rec.Code)
	}
	var actor, newV string
	if err := e.pool.QueryRow(context.Background(), `SELECT actor, new_value::text FROM audit_log WHERE action = 'password_reset'`).Scan(&actor, &newV); err != nil {
		t.Fatalf("password_reset must be audited: %v", err)
	}
	if actor != "admin@crown.example" || !strings.Contains(newV, `"must_change_password": true`) || strings.Contains(strings.ToLower(newV), "argon") || strings.Contains(newV, "brand new") {
		t.Fatalf("audit row = %s %s (must name the actor, the flag, and carry no secret)", actor, newV)
	}
}

func TestPasswords_ChangeOwn(t *testing.T) {
	e := setup(t)
	c1, _ := signIn(t, e, "w@crown.example", "purchaser")
	c2 := sessionOf(t, login(e, "w@crown.example", pw)) // a second device

	if rec := e.do("POST", "/api/auth/password", `{"current_password":"wrong wrong wrong","new_password":"another good one"}`, c1); rec.Code != 403 {
		t.Fatalf("wrong current = %d", rec.Code)
	}
	if rec := e.do("POST", "/api/auth/password", `{"current_password":"`+pw+`","new_password":"short"}`, c1); rec.Code != 422 {
		t.Fatalf("weak new = %d", rec.Code)
	}
	if rec := e.do("POST", "/api/auth/password", `{"current_password":"`+pw+`","new_password":"another good one"}`, c1); rec.Code != 204 {
		t.Fatalf("change = %d", rec.Code)
	}
	if rec := e.do("GET", "/api/auth/me", "", c1); rec.Code != 200 {
		t.Fatal("the session used for the change must stay")
	}
	if rec := e.do("GET", "/api/auth/me", "", c2); rec.Code != 401 {
		t.Fatal("other sessions must end")
	}
	if rec := e.do("POST", "/api/auth/password", `{"current_password":"x","new_password":"another good one"}`, nil); rec.Code != 401 {
		t.Fatalf("anonymous change = %d", rec.Code)
	}
}

func TestUsersAPI_RejectsUnknownFieldsAndForms(t *testing.T) {
	e := setup(t)
	admin, id := signIn(t, e, "admin@crown.example", "admin")
	if rec := e.do("PATCH", "/api/users/"+id, `{"password_hash":"x"}`, admin); rec.Code != 400 {
		t.Fatalf("unknown field = %d", rec.Code)
	}
}

func TestLastAdmin_TwoAdminsCannotRemoveEachOtherAtOnce(t *testing.T) {
	e := setup(t)
	_, id1 := signIn(t, e, "a1@crown.example", "admin")
	_, id2 := signIn(t, e, "a2@crown.example", "admin")
	off := false
	ctx := context.Background()

	// The race window is small, so repeat it; without the lock this fails within a few rounds.
	for round := 0; round < 40; round++ {
		if _, err := e.pool.Exec(ctx, `UPDATE users SET active = true`); err != nil {
			t.Fatal(err)
		}
		errs := make(chan error, 2)
		go func() { errs <- e.svc.UpdateUser(ctx, "a1", id2, auth.UserUpdate{Active: &off}) }()
		go func() { errs <- e.svc.UpdateUser(ctx, "a2", id1, auth.UserUpdate{Active: &off}) }()
		var ok, blocked int
		for i := 0; i < 2; i++ {
			switch err := <-errs; {
			case err == nil:
				ok++
			case errors.Is(err, auth.ErrLastAdmin):
				blocked++
			default:
				t.Fatal(err)
			}
		}
		var active int
		e.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE active`).Scan(&active) //nolint:errcheck
		if ok != 1 || blocked != 1 || active != 1 {
			t.Fatalf("round %d: ok=%d blocked=%d active=%d, want 1/1/1", round, ok, blocked, active)
		}
	}
}
