package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
	"github.com/yadi09/Manufacturing_System/backend/internal/httpapi"
	"github.com/yadi09/Manufacturing_System/backend/internal/testdb"
)

const pw = "a long enough password"

type env struct {
	pool *pgxpool.Pool
	svc  *auth.Service
	h    http.Handler
}

func setup(t *testing.T) env {
	t.Helper()
	pool := testdb.New(t)
	svc := auth.NewService(pool)
	return env{pool, svc, httpapi.NewRouter(httpapi.Deps{DB: pool, Auth: svc})}
}

func (e env) do(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func sessionOf(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == "session" {
			return c
		}
	}
	t.Fatal("no session cookie")
	return nil
}

func (e env) mustUser(t *testing.T, email string, roles ...string) {
	t.Helper()
	if _, err := e.svc.CreateUser(context.Background(), "test", email, "Test User", pw, roles, false); err != nil {
		t.Fatal(err)
	}
}

func login(e env, email, password string) *httptest.ResponseRecorder {
	return e.do("POST", "/api/auth/login", `{"email":"`+email+`","password":"`+password+`"}`, nil)
}

func TestLogin_Me_Logout(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "Sales@Crown.example", "cashier")

	rec := login(e, " sales@crown.example ", pw) // email is trimmed and case-insensitive
	if rec.Code != 200 {
		t.Fatalf("login = %d %s", rec.Code, rec.Body)
	}
	c := sessionOf(t, rec)
	if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie must be HttpOnly and SameSite=Lax: %+v", c)
	}
	if body := rec.Body.String(); strings.Contains(body, "argon2") || strings.Contains(body, `"password"`) || strings.Contains(body, "password_hash") {
		t.Fatal("response must not include password data")
	}

	me := e.do("GET", "/api/auth/me", "", c)
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"key":"cashier"`) {
		t.Fatalf("me = %d %s", me.Code, me.Body)
	}

	if out := e.do("POST", "/api/auth/logout", "", c); out.Code != 204 {
		t.Fatalf("logout = %d", out.Code)
	}
	if after := e.do("GET", "/api/auth/me", "", c); after.Code != 401 {
		t.Fatalf("session must be dead after logout, got %d", after.Code)
	}
}

func TestLogin_FailuresLookTheSameAndAreAudited(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")

	wrongPw := login(e, "a@crown.example", "not the password")
	unknown := login(e, "nobody@crown.example", pw)
	if wrongPw.Code != 401 || unknown.Code != 401 || wrongPw.Body.String() != unknown.Body.String() {
		t.Fatalf("failures must be identical: %d %q vs %d %q", wrongPw.Code, wrongPw.Body, unknown.Code, unknown.Body)
	}
	if len(wrongPw.Result().Cookies()) != 0 {
		t.Fatal("no cookie on failure")
	}
	var n int
	if err := e.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE action = 'login_failed'`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("login_failed audit rows = %d, %v", n, err)
	}
	login(e, "a@crown.example", pw)
	if err := e.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE action = 'login'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("login audit rows = %d, %v", n, err)
	}
}

func TestLogin_RequiresJSON(t *testing.T) {
	e := setup(t)
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader("email=a&password=b"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestMe_RequiresSession(t *testing.T) {
	e := setup(t)
	if rec := e.do("GET", "/api/auth/me", "", nil); rec.Code != 401 {
		t.Fatalf("no cookie: %d", rec.Code)
	}
	if rec := e.do("GET", "/api/auth/me", "", &http.Cookie{Name: "session", Value: "forged"}); rec.Code != 401 {
		t.Fatalf("forged cookie: %d", rec.Code)
	}
}

func TestSession_ExpiredAndDeactivated(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	c := sessionOf(t, login(e, "a@crown.example", pw))

	if _, err := e.pool.Exec(context.Background(), `UPDATE users SET active = false`); err != nil {
		t.Fatal(err)
	}
	if rec := e.do("GET", "/api/auth/me", "", c); rec.Code != 401 {
		t.Fatalf("deactivated user keeps access: %d", rec.Code)
	}
	if rec := login(e, "a@crown.example", pw); rec.Code != 401 {
		t.Fatalf("deactivated user can log in: %d", rec.Code)
	}

	e.pool.Exec(context.Background(), `UPDATE users SET active = true`) //nolint:errcheck
	c = sessionOf(t, login(e, "a@crown.example", pw))
	e.pool.Exec(context.Background(), `UPDATE sessions SET expires_at = now() - interval '1 minute'`) //nolint:errcheck
	if rec := e.do("GET", "/api/auth/me", "", c); rec.Code != 401 {
		t.Fatalf("expired session accepted: %d", rec.Code)
	}
}

func TestSessionToken_NotStoredInPlainText(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example")
	c := sessionOf(t, login(e, "a@crown.example", pw))
	var n int
	if err := e.pool.QueryRow(context.Background(), `SELECT count(*) FROM sessions WHERE encode(token_hash, 'escape') = $1`, c.Value).Scan(&n); err != nil || n != 0 {
		t.Fatalf("raw token found in database: %d %v", n, err)
	}
}

func TestPermissions_FollowRoles(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "admin@crown.example", "admin")
	e.mustUser(t, "cash@crown.example", "cashier")
	e.mustUser(t, "none@crown.example")

	r := chi.NewRouter()
	r.Use(httpapi.RequireAuth(e.svc))
	r.With(httpapi.RequirePermission("users.manage")).Get("/admin-only", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })

	status := func(email string) int {
		c := sessionOf(t, login(e, email, pw))
		req := httptest.NewRequest("GET", "/admin-only", nil)
		req.AddCookie(c)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	if got := status("admin@crown.example"); got != 200 {
		t.Errorf("admin = %d", got)
	}
	if got := status("cash@crown.example"); got != 403 {
		t.Errorf("cashier = %d, want 403", got)
	}
	if got := status("none@crown.example"); got != 403 {
		t.Errorf("no role = %d, want 403", got)
	}
	anon := httptest.NewRecorder()
	r.ServeHTTP(anon, httptest.NewRequest("GET", "/admin-only", nil))
	if anon.Code != 401 {
		t.Errorf("anonymous = %d, want 401", anon.Code)
	}
}

func TestMultipleRolesCombine(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "x@crown.example", "operator", "qc_inspector", "owner")
	_, u, err := e.svc.Login(context.Background(), "x@crown.example", pw)
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Roles) != 3 || !u.Can("audit.read") || u.Can("users.manage") {
		t.Fatalf("roles/permissions wrong: %+v", u)
	}
}

func TestCreateUser_Validation(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	e.mustUser(t, "a@crown.example", "cashier")
	cases := []struct {
		name, email, password string
		roles                 []string
		want                  error
	}{
		{"duplicate email, other case", "A@Crown.example", pw, nil, auth.ErrEmailTaken},
		{"weak password", "b@crown.example", "short", nil, auth.ErrWeakPassword},
		{"bad email", "not-an-email", pw, nil, auth.ErrInvalidEmail},
	}
	for _, c := range cases {
		if _, err := e.svc.CreateUser(ctx, "test", c.email, "X", c.password, c.roles, false); err != c.want {
			t.Errorf("%s: got %v, want %v", c.name, err, c.want)
		}
	}
	if _, err := e.svc.CreateUser(ctx, "test", "c@crown.example", "X", pw, []string{"no_such_role"}, false); err == nil {
		t.Error("unknown role must be rejected")
	}
	var n int
	e.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE email = 'c@crown.example'`).Scan(&n) //nolint:errcheck
	if n != 0 {
		t.Error("failed role assignment must roll back the user")
	}
}

func TestCreateUser_IsAudited(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	var actor, newV string
	if err := e.pool.QueryRow(context.Background(), `SELECT actor, new_value::text FROM audit_log WHERE entity = 'users'`).Scan(&actor, &newV); err != nil {
		t.Fatal(err)
	}
	if actor != "test" || !strings.Contains(newV, "a@crown.example") || strings.Contains(newV, "argon2") {
		t.Fatalf("audit row: %s %s", actor, newV)
	}
}
