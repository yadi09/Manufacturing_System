package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"
)

type prefs struct {
	Preferences struct {
		Language *string `json:"language"`
		Calendar *string `json:"calendar"`
	} `json:"preferences"`
}

func getPrefs(t *testing.T, e env, body string) prefs {
	t.Helper()
	var p prefs
	if err := json.Unmarshal([]byte(body), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestPreferences_StartEmptyThenAreSavedPerPerson(t *testing.T) {
	e := setup(t)
	c1, _ := signIn(t, e, "a@crown.example", "cashier")
	c2, _ := signIn(t, e, "b@crown.example", "cashier")

	if p := getPrefs(t, e, e.do("GET", "/api/auth/me", "", c1).Body.String()); p.Preferences.Language != nil || p.Preferences.Calendar != nil {
		t.Fatalf("new person must start with nothing chosen: %+v", p)
	}
	if r := e.do("PATCH", "/api/auth/preferences", `{"language":"am"}`, c1); r.Code != 204 {
		t.Fatalf("save language = %d %s", r.Code, r.Body)
	}
	if r := e.do("PATCH", "/api/auth/preferences", `{"calendar":"gregorian"}`, c1); r.Code != 204 {
		t.Fatalf("save calendar = %d %s", r.Code, r.Body)
	}
	p := getPrefs(t, e, e.do("GET", "/api/auth/me", "", c1).Body.String())
	if p.Preferences.Language == nil || *p.Preferences.Language != "am" || p.Preferences.Calendar == nil || *p.Preferences.Calendar != "gregorian" {
		t.Fatalf("saved choices must both be kept (a patch changes only what is sent): %+v", p)
	}
	// Someone else is not affected.
	if other := getPrefs(t, e, e.do("GET", "/api/auth/me", "", c2).Body.String()); other.Preferences.Language != nil || other.Preferences.Calendar != nil {
		t.Fatalf("another person's choices changed: %+v", other)
	}
}

func TestPreferences_FollowThePersonToANewSession(t *testing.T) {
	e := setup(t)
	c, _ := signIn(t, e, "a@crown.example", "cashier")
	e.do("PATCH", "/api/auth/preferences", `{"language":"am","calendar":"gregorian"}`, c)
	e.do("POST", "/api/auth/logout", "", c)

	rec := login(e, "a@crown.example", pw) // a different device, a new session
	if !strings.Contains(rec.Body.String(), `"language":"am"`) || !strings.Contains(rec.Body.String(), `"calendar":"gregorian"`) {
		t.Fatalf("sign-in must return the saved choices: %s", rec.Body)
	}
}

func TestPreferences_RejectsUnknownValuesAndFields(t *testing.T) {
	e := setup(t)
	c, _ := signIn(t, e, "a@crown.example", "cashier")
	for _, body := range []string{`{"language":"fr"}`, `{"calendar":"julian"}`, `{"language":""}`} {
		if r := e.do("PATCH", "/api/auth/preferences", body, c); r.Code != 422 || !strings.Contains(r.Body.String(), "invalid_preference") {
			t.Errorf("%s = %d %s, want 422 invalid_preference", body, r.Code, r.Body)
		}
	}
	if r := e.do("PATCH", "/api/auth/preferences", `{"email":"x@y.z"}`, c); r.Code != 400 {
		t.Errorf("unknown field = %d, want 400", r.Code)
	}
	if p := getPrefs(t, e, e.do("GET", "/api/auth/me", "", c).Body.String()); p.Preferences.Language != nil {
		t.Errorf("a rejected request must change nothing: %+v", p)
	}
}

func TestPreferences_NeedASessionButNotAPasswordChange(t *testing.T) {
	e := setup(t)
	if r := e.do("PATCH", "/api/auth/preferences", `{"language":"am"}`, nil); r.Code != 401 {
		t.Fatalf("anonymous = %d", r.Code)
	}
	// A person who must change their password may still choose their language.
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	e.do("POST", "/api/users", `{"email":"new@crown.example","full_name":"New","password":"first password!!","roles":["cashier"]}`, admin)
	c := sessionOf(t, login(e, "new@crown.example", "first password!!"))
	if r := e.do("GET", "/api/roles", "", c); r.Code != 403 {
		t.Fatalf("setup: must be locked, got %d", r.Code)
	}
	if r := e.do("PATCH", "/api/auth/preferences", `{"language":"am"}`, c); r.Code != 204 {
		t.Fatalf("language while forced = %d %s", r.Code, r.Body)
	}
}
