package httpapi_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

type auditRow struct{ actor, action, oldV, newV string }

func auditFor(t *testing.T, e env, entityID string) []auditRow {
	t.Helper()
	rows, err := e.pool.Query(context.Background(),
		`SELECT actor, action, COALESCE(old_value::text, ''), COALESCE(new_value::text, '') FROM audit_log WHERE entity = 'users' AND entity_id = $1 ORDER BY id`, entityID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []auditRow
	for rows.Next() {
		var r auditRow
		if err := rows.Scan(&r.actor, &r.action, &r.oldV, &r.newV); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func find(rows []auditRow, action string) *auditRow {
	for i := range rows {
		if rows[i].action == action {
			return &rows[i]
		}
	}
	return nil
}

func TestMustChange_NewUserCanOnlyChangePassword(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	rec := e.do("POST", "/api/users", `{"email":"new@crown.example","full_name":"New","password":"first password!!","roles":["admin"]}`, admin)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"must_change_password":true`) {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	c := sessionOf(t, login(e, "new@crown.example", "first password!!"))

	// Everything else is closed, even for an administrator.
	for _, p := range [][2]string{{"GET", "/api/users"}, {"GET", "/api/roles"}} {
		r := e.do(p[0], p[1], "", c)
		if r.Code != 403 || !strings.Contains(r.Body.String(), "password_change_required") {
			t.Fatalf("%s %s = %d %s, want 403 password_change_required", p[0], p[1], r.Code, r.Body)
		}
	}
	if r := e.do("PATCH", "/api/users/00000000-0000-0000-0000-000000000000", `{"active":false}`, c); r.Code != 403 {
		t.Fatalf("patch = %d", r.Code)
	}
	// Reading who I am, changing the password and signing out stay open.
	me := e.do("GET", "/api/auth/me", "", c)
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"must_change_password":true`) {
		t.Fatalf("me = %d %s", me.Code, me.Body)
	}
	if r := e.do("POST", "/api/auth/password", `{"current_password":"first password!!","new_password":"first password!!"}`, c); r.Code != 422 || !strings.Contains(r.Body.String(), "password_unchanged") {
		t.Fatalf("same password = %d %s", r.Code, r.Body)
	}
	if r := e.do("POST", "/api/auth/password", `{"current_password":"first password!!","new_password":"my own new password"}`, c); r.Code != 204 {
		t.Fatalf("change = %d %s", r.Code, r.Body)
	}
	if r := e.do("GET", "/api/users", "", c); r.Code != 200 {
		t.Fatalf("after the change the user must be unlocked, got %d", r.Code)
	}
	if me := e.do("GET", "/api/auth/me", "", c); !strings.Contains(me.Body.String(), `"must_change_password":false`) {
		t.Fatalf("flag still set: %s", me.Body)
	}
}

func TestMustChange_AdminResetSetsItAgain(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	_, id := signIn(t, e, "w@crown.example", "purchaser")

	if r := e.do("POST", "/api/users/"+id+"/password", `{"password":"temporary password"}`, admin); r.Code != 204 {
		t.Fatalf("reset = %d", r.Code)
	}
	c := sessionOf(t, login(e, "w@crown.example", "temporary password"))
	if r := e.do("GET", "/api/roles", "", c); r.Code != 403 {
		t.Fatalf("reset user must be locked to the password change: %d", r.Code)
	}
	list := e.do("GET", "/api/users", "", admin)
	var users []struct {
		Email              string `json:"email"`
		MustChangePassword bool   `json:"must_change_password"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &users); err != nil {
		t.Fatal(err)
	}
	for _, u := range users {
		if want := u.Email == "w@crown.example"; u.MustChangePassword != want {
			t.Fatalf("%s must_change_password = %v", u.Email, u.MustChangePassword)
		}
	}
}

func TestMustChange_CLIStyleCreateDoesNotForceIt(t *testing.T) {
	e := setup(t)
	_, _ = signIn(t, e, "admin@crown.example", "admin") // created with mustChange=false, like make create-user
	c := sessionOf(t, login(e, "admin@crown.example", pw))
	if r := e.do("GET", "/api/users", "", c); r.Code != 200 {
		t.Fatalf("got %d", r.Code)
	}
}

func TestAudit_EachChangeHasItsOwnRowWithOldAndNew(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	_, id := signIn(t, e, "w@crown.example", "purchaser")

	if r := e.do("PATCH", "/api/users/"+id, `{"roles":["qc_inspector","owner"]}`, admin); r.Code != 204 {
		t.Fatal(r.Code, r.Body)
	}
	if r := e.do("PATCH", "/api/users/"+id, `{"active":false}`, admin); r.Code != 204 {
		t.Fatal(r.Code)
	}
	if r := e.do("PATCH", "/api/users/"+id, `{"active":true}`, admin); r.Code != 204 {
		t.Fatal(r.Code)
	}
	if r := e.do("PATCH", "/api/users/"+id, `{"full_name":"Renamed Person"}`, admin); r.Code != 204 {
		t.Fatal(r.Code)
	}
	if r := e.do("POST", "/api/users/"+id+"/password", `{"password":"temporary password"}`, admin); r.Code != 204 {
		t.Fatal(r.Code)
	}
	rows := auditFor(t, e, id)

	roles := find(rows, "roles_change")
	if roles == nil || !strings.Contains(roles.oldV, "purchaser") || strings.Contains(roles.oldV, "owner") || !strings.Contains(roles.newV, "owner") || !strings.Contains(roles.newV, "qc_inspector") || strings.Contains(roles.newV, "purchaser") {
		t.Fatalf("roles_change = %+v", roles)
	}
	off, on := find(rows, "deactivate"), find(rows, "reactivate")
	if off == nil || !strings.Contains(off.oldV, "true") || !strings.Contains(off.newV, "false") {
		t.Fatalf("deactivate = %+v", off)
	}
	if on == nil || !strings.Contains(on.oldV, "false") || !strings.Contains(on.newV, "true") {
		t.Fatalf("reactivate = %+v", on)
	}
	if r := find(rows, "rename"); r == nil || !strings.Contains(r.newV, "Renamed Person") {
		t.Fatalf("rename = %+v", r)
	}
	if r := find(rows, "password_reset"); r == nil || !strings.Contains(r.newV, "true") {
		t.Fatalf("password_reset = %+v", r)
	}
	for _, r := range rows {
		if r.actor != "admin@crown.example" && r.action != "create" {
			t.Errorf("%s: actor = %q, want the signed-in administrator", r.action, r.actor)
		}
		if strings.Contains(strings.ToLower(r.oldV+r.newV), "argon") || strings.Contains(r.newV, "temporary password") {
			t.Errorf("%s: the audit log must never hold a password or hash: %s", r.action, r.newV)
		}
	}
	// An unchanged save writes nothing.
	before := len(rows)
	e.do("PATCH", "/api/users/"+id, `{"full_name":"Renamed Person","active":true}`, admin)
	if after := len(auditFor(t, e, id)); after != before {
		t.Fatalf("a save with no change added %d audit rows", after-before)
	}
}

func TestReactivate_LetsThePersonSignInAgain(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	_, id := signIn(t, e, "w@crown.example", "purchaser")
	e.do("PATCH", "/api/users/"+id, `{"active":false}`, admin)
	if r := login(e, "w@crown.example", pw); r.Code != 401 {
		t.Fatalf("deactivated login = %d", r.Code)
	}
	e.do("PATCH", "/api/users/"+id, `{"active":true}`, admin)
	if r := login(e, "w@crown.example", pw); r.Code != 200 {
		t.Fatalf("reactivated login = %d", r.Code)
	}
}

func TestLastAdmin_CannotBeDeactivatedOrLoseTheRole_ButCanOnceAnotherExists(t *testing.T) {
	e := setup(t)
	admin, id := signIn(t, e, "admin@crown.example", "admin")
	for _, body := range []string{`{"active":false}`, `{"roles":["owner"]}`, `{"roles":[]}`} {
		if r := e.do("PATCH", "/api/users/"+id, body, admin); r.Code != 409 || !strings.Contains(r.Body.String(), "last_admin") {
			t.Fatalf("%s = %d %s", body, r.Code, r.Body)
		}
	}
	// Making someone else an administrator first unblocks it, as the message says.
	_, otherID := signIn(t, e, "second@crown.example", "cashier")
	if r := e.do("PATCH", "/api/users/"+otherID, `{"roles":["admin"]}`, admin); r.Code != 204 {
		t.Fatal(r.Code)
	}
	if r := e.do("PATCH", "/api/users/"+id, `{"active":false}`, admin); r.Code != 204 {
		t.Fatalf("with a second administrator = %d", r.Code)
	}
	// A deactivated administrator does not count: the remaining one is now protected.
	second := sessionOf(t, login(e, "second@crown.example", pw))
	if r := e.do("PATCH", "/api/users/"+otherID, `{"active":false}`, second); r.Code != 409 {
		t.Fatalf("remaining administrator = %d", r.Code)
	}
}

func TestRoles_NamesAndDescriptionsAreDataInBothLanguages(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	rec := e.do("GET", "/api/roles", "", admin)
	var roles []struct {
		Key, Name, NameAm, Description, DescriptionAm string
		Name_am, Description_am                       string
	}
	var raw []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	_ = roles
	if len(raw) != 10 {
		t.Fatalf("roles = %d, want the sign-in roles: process.md's list minus operators (no accounts), plus administrator", len(raw))
	}
	for _, r := range raw {
		for _, f := range []string{"name", "name_am", "description", "description_am"} {
			if s, _ := r[f].(string); strings.TrimSpace(s) == "" {
				t.Errorf("role %v has no %s", r["key"], f)
			}
		}
	}
}

func TestOperatorIsNotASignInRole(t *testing.T) {
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	rec := e.do("GET", "/api/roles", "", admin)
	if strings.Contains(rec.Body.String(), `"key":"operator"`) {
		t.Fatal("operators have no accounts: the operator role must not be assignable")
	}
	if r := e.do("POST", "/api/users", `{"email":"x@crown.example","full_name":"X","password":"a long enough one","roles":["operator"]}`, admin); r.Code != 422 || !strings.Contains(r.Body.String(), "unknown_role") {
		t.Fatalf("creating a user with the operator role = %d %s, want 422 unknown_role", r.Code, r.Body)
	}
}
