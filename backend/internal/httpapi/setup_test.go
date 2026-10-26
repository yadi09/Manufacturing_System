package httpapi_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func decode(t *testing.T, body []byte, v any) {
	t.Helper()
	if err := json.Unmarshal(body, v); err != nil {
		t.Fatalf("%v: %s", err, body)
	}
}

func (f fixture) count(t *testing.T, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := f.e.pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestSetupData_Permissions(t *testing.T) {
	f := newFixture(t)
	pm, _ := signIn(t, f.e, "pm@crown.example", "production_manager")
	cash, _ := signIn(t, f.e, "cash@crown.example", "cashier")

	posts := map[string]string{
		"/api/workspaces":  `{"kind":"machine","name":"Machine 1","name_am":"ማሽን 1"}`,
		"/api/moulds":      `{"product_id":"` + f.jarCover + `","name":"Clear jar cap mould","name_am":"የግልጽ ጀሪካን ክዳን ሻጋታ","cavities":11}`,
		"/api/shifts":      `{"name":"Night","name_am":"ሌሊት","start_time":"18:00","end_time":"08:00","position":2}`,
		"/api/reasons":     `{"kind":"damage","name":"Splitting","name_am":"መሰንጠቅ"}`,
		"/api/professions": `{"name":"Machine operator","name_am":"የማሽን ኦፕሬተር"}`,
	}
	for path, body := range posts {
		if r := f.e.do("GET", path, "", nil); r.Code != 401 {
			t.Errorf("anonymous GET %s = %d", path, r.Code)
		}
		if r := f.e.do("GET", path, "", cash); r.Code != 403 {
			t.Errorf("cashier GET %s = %d", path, r.Code)
		}
		if r := f.e.do("GET", path, "", pm); r.Code != 200 {
			t.Errorf("production manager GET %s = %d", path, r.Code)
		}
		// Only administrators change machines, moulds and cycle times (owner, 2026-10-21), and the rest.
		if r := f.e.do("POST", path, body, pm); r.Code != 403 {
			t.Errorf("production manager POST %s = %d", path, r.Code)
		}
		if r := f.e.do("POST", path, body, f.admin); r.Code != 201 {
			t.Errorf("admin POST %s = %d %s", path, r.Code, r.Body)
		}
	}
	for _, path := range []string{"/api/locations", "/api/employees"} {
		if r := f.e.do("GET", path, "", pm); r.Code != 200 {
			t.Errorf("production manager GET %s = %d", path, r.Code)
		}
	}
	if r := f.e.do("PATCH", "/api/locations/raw_store", `{"name":"Store A","name_am":"መጋዘን ሀ"}`, pm); r.Code != 403 {
		t.Errorf("production manager renames a store = %d", r.Code)
	}
	if r := f.e.do("GET", "/api/settings", "", pm); r.Code != 403 {
		t.Errorf("production manager reads settings = %d", r.Code)
	}
	if r := f.e.do("GET", "/api/settings", "", f.admin); r.Code != 200 {
		t.Errorf("admin reads settings = %d", r.Code)
	}
}

type workspaceBody struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Setups []struct {
		MouldID        string  `json:"mould_id"`
		StandardCycleS *string `json:"standard_cycle_s"`
		Active         bool    `json:"active"`
		Colours        []struct {
			ColourID string `json:"colour_id"`
			CycleS   string `json:"cycle_s"`
		} `json:"colours"`
	} `json:"setups"`
}

func TestMachines_MouldsAndCycleTimes(t *testing.T) {
	f := newFixture(t)
	m2 := mustID(t, f.e.do("POST", "/api/workspaces", `{"kind":"machine","name":"Machine 2","name_am":"ማሽን 2"}`, f.admin), 201)
	qc := mustID(t, f.e.do("POST", "/api/workspaces", `{"kind":"qc","name":"QC area","name_am":"የጥራት ቁጥጥር ቦታ","runs_24h":true}`, f.admin), 201)
	if r := f.e.do("POST", "/api/workspaces", `{"kind":"machine","name":"machine 2","name_am":"ማሽን"}`, f.admin); r.Code != 409 || errCode(r) != "duplicate_name" {
		t.Errorf("duplicate machine name = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("POST", "/api/workspaces", `{"kind":"warehouse","name":"X","name_am":"X"}`, f.admin); r.Code != 422 {
		t.Errorf("unknown kind = %d", r.Code)
	}

	mould := mustID(t, f.e.do("POST", "/api/moulds", `{"product_id":"`+f.jarCover+`","name":"Clear jar cap mould","name_am":"የግልጽ ጀሪካን ክዳን ሻጋታ","cavities":11}`, f.admin), 201)
	eggMould := mustID(t, f.e.do("POST", "/api/moulds", `{"product_id":"`+f.eggTray+`","name":"Egg tray mould","name_am":"የእንቁላል ትሪ ሻጋታ"}`, f.admin), 201) // cavities not known yet
	for _, body := range []string{`"cavities":0`, `"cavities":-3`} {
		if r := f.e.do("POST", "/api/moulds", `{"product_id":"`+f.jarCover+`","name":"Bad","name_am":"Bad",`+body+`}`, f.admin); r.Code != 422 || errCode(r) != "invalid_cavities" {
			t.Errorf("%s = %d %s", body, r.Code, r.Body)
		}
	}
	if r := f.e.do("POST", "/api/moulds", `{"product_id":"00000000-0000-0000-0000-000000000000","name":"X","name_am":"X"}`, f.admin); errCode(r) != "unknown_product" {
		t.Errorf("unknown product = %d %s", r.Code, r.Body)
	}

	blue := mustID(t, f.e.do("POST", "/api/products/"+f.jarCover+"/colours", `{"name":"Blue","name_am":"ሰማያዊ"}`, f.admin), 201)
	r := f.e.do("PUT", "/api/workspaces/"+m2+"/moulds/"+mould, `{"standard_cycle_s":"31.7","colours":[{"colour_id":"`+blue+`","cycle_s":"30.7"}]}`, f.admin)
	if r.Code != 200 {
		t.Fatalf("put mould on machine = %d %s", r.Code, r.Body)
	}
	var w workspaceBody
	decode(t, r.Body.Bytes(), &w)
	if len(w.Setups) != 1 || *w.Setups[0].StandardCycleS != "31.70" || len(w.Setups[0].Colours) != 1 || w.Setups[0].Colours[0].CycleS != "30.70" {
		t.Errorf("setup = %+v", w.Setups)
	}

	// A colour of another product, a mould on a non-machine, and bad cycle times are refused.
	if r := f.e.do("PUT", "/api/workspaces/"+m2+"/moulds/"+mould, `{"standard_cycle_s":"31.7","colours":[{"colour_id":"`+f.greyColour+`","cycle_s":"30"}]}`, f.admin); errCode(r) != "unknown_colour" {
		t.Errorf("colour of egg tray on jar cap mould = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("PUT", "/api/workspaces/"+qc+"/moulds/"+eggMould, `{}`, f.admin); errCode(r) != "not_a_machine" {
		t.Errorf("mould on QC area = %d %s", r.Code, r.Body)
	}
	for _, v := range []string{`"0"`, `"31.755"`, `"-1"`, `"4000"`, `"abc"`} {
		if r := f.e.do("PUT", "/api/workspaces/"+m2+"/moulds/"+mould, `{"standard_cycle_s":`+v+`}`, f.admin); errCode(r) != "invalid_cycle_time" {
			t.Errorf("cycle %s = %d %s", v, r.Code, r.Body)
		}
	}
	// Refusals change nothing: still 31.70 with the Blue time.
	if n := f.count(t, `SELECT count(*) FROM mould_setup_colours`); n != 1 {
		t.Errorf("colour cycle times after refusals = %d", n)
	}

	// Taking the mould off keeps the row (history may point to it).
	r = f.e.do("PUT", "/api/workspaces/"+m2+"/moulds/"+mould, `{"standard_cycle_s":"31.7","active":false}`, f.admin)
	decode(t, r.Body.Bytes(), &w)
	if r.Code != 200 || w.Setups[0].Active || len(w.Setups[0].Colours) != 0 {
		t.Errorf("take off = %d %+v", r.Code, w.Setups)
	}
	if n := f.count(t, `SELECT count(*) FROM audit_log WHERE entity = 'workspaces' AND entity_id = $1 AND action = 'update'`, m2); n != 2 {
		t.Errorf("audit rows for machine 2 changes = %d, want 2", n)
	}
}

func TestShifts_TimesAndReasons(t *testing.T) {
	f := newFixture(t)
	var night struct {
		ID              string `json:"id"`
		StartTime       string `json:"start_time"`
		EndTime         string `json:"end_time"`
		CrossesMidnight bool   `json:"crosses_midnight"`
	}
	r := f.e.do("POST", "/api/shifts", `{"name":"Night","name_am":"ሌሊት","start_time":"18:00","end_time":"08:00","position":2}`, f.admin)
	decode(t, r.Body.Bytes(), &night)
	if r.Code != 201 || !night.CrossesMidnight || night.StartTime != "18:00" || night.EndTime != "08:00" {
		t.Fatalf("night = %d %+v", r.Code, night)
	}
	var day struct {
		CrossesMidnight bool `json:"crosses_midnight"`
	}
	decode(t, f.e.do("POST", "/api/shifts", `{"name":"Day","name_am":"ቀን","start_time":"08:00","end_time":"18:00","position":1}`, f.admin).Body.Bytes(), &day)
	if day.CrossesMidnight {
		t.Error("day shift should not cross midnight")
	}
	for _, body := range []string{`"start_time":"24:00","end_time":"08:00"`, `"start_time":"8:00","end_time":"18:00"`, `"start_time":"08:00","end_time":"08:00"`} {
		if r := f.e.do("POST", "/api/shifts", `{"name":"X","name_am":"X",`+body+`}`, f.admin); errCode(r) != "invalid_time" {
			t.Errorf("%s = %d %s", body, r.Code, r.Body)
		}
	}

	// New times need a reason; a rename does not.
	if r := f.e.do("PATCH", "/api/shifts/"+night.ID, `{"name":"Night","name_am":"ሌሊት","start_time":"19:00","end_time":"07:00"}`, f.admin); r.Code != 422 || errCode(r) != "reason_required" {
		t.Errorf("time change without reason = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("PATCH", "/api/shifts/"+night.ID, `{"name":"Night shift","name_am":"ሌሊት","start_time":"18:00","end_time":"08:00"}`, f.admin); r.Code != 200 {
		t.Errorf("rename = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("PATCH", "/api/shifts/"+night.ID, `{"name":"Night shift","name_am":"ሌሊት","start_time":"19:00","end_time":"07:00","reason":"Power schedule changed."}`, f.admin); r.Code != 200 {
		t.Fatalf("time change with reason = %d %s", r.Code, r.Body)
	}
	var reason, oldV, newV string
	if err := f.e.pool.QueryRow(context.Background(), `SELECT reason, old_value::text, new_value::text FROM audit_log WHERE entity = 'shifts' AND entity_id = $1 AND reason IS NOT NULL`, night.ID).Scan(&reason, &oldV, &newV); err != nil {
		t.Fatal(err)
	}
	if reason != "Power schedule changed." || !strings.Contains(oldV, `"18:00"`) || !strings.Contains(newV, `"19:00"`) {
		t.Errorf("audit = %q %s %s", reason, oldV, newV)
	}
}

func TestReasons_KindsAndRetire(t *testing.T) {
	f := newFixture(t)
	id := mustID(t, f.e.do("POST", "/api/reasons", `{"kind":"damage","name":"Splitting","name_am":"መሰንጠቅ"}`, f.admin), 201)
	if r := f.e.do("POST", "/api/reasons", `{"kind":"damage","name":"splitting","name_am":"መሰንጠቅ"}`, f.admin); r.Code != 409 {
		t.Errorf("duplicate damage reason = %d", r.Code)
	}
	if r := f.e.do("POST", "/api/reasons", `{"kind":"downtime","name":"Splitting","name_am":"መሰንጠቅ"}`, f.admin); r.Code != 201 {
		t.Errorf("same name in another kind = %d", r.Code)
	}
	if r := f.e.do("POST", "/api/reasons", `{"kind":"plan","name":"X","name_am":"X"}`, f.admin); r.Code != 422 {
		t.Errorf("unknown kind = %d", r.Code)
	}
	if r := f.e.do("PATCH", "/api/reasons/"+id, `{"kind":"downtime","name":"Splitting","name_am":"መሰንጠቅ","active":false}`, f.admin); r.Code != 200 {
		t.Fatalf("retire = %d %s", r.Code, r.Body)
	}
	var kind string
	var active bool
	f.e.pool.QueryRow(context.Background(), `SELECT kind, active FROM reasons WHERE id = $1`, id).Scan(&kind, &active) //nolint:errcheck
	if kind != "damage" || active {
		t.Errorf("after retire: kind %s (must not change), active %v", kind, active)
	}
}

func TestLocations_FixedButRenamable(t *testing.T) {
	f := newFixture(t)
	var locs []struct {
		Key        string `json:"key"`
		HoldsStock bool   `json:"holds_stock"`
	}
	decode(t, f.e.do("GET", "/api/locations", "", f.admin).Body.Bytes(), &locs)
	stock := map[string]bool{"raw_store": true, "regrind_store": true, "qc_area": false, "staging_area": false, "fg_store": true}
	if len(locs) != 5 {
		t.Fatalf("locations = %+v", locs)
	}
	for _, l := range locs {
		if want, ok := stock[l.Key]; !ok || want != l.HoldsStock {
			t.Errorf("%s holds_stock = %v", l.Key, l.HoldsStock)
		}
	}
	if r := f.e.do("PATCH", "/api/locations/raw_store", `{"name":"Main raw material store","name_am":"ዋና የጥሬ ዕቃ መጋዘን"}`, f.admin); r.Code != 200 {
		t.Errorf("rename = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("PATCH", "/api/locations/warehouse", `{"name":"X","name_am":"X"}`, f.admin); r.Code != 404 {
		t.Errorf("unknown location = %d", r.Code)
	}
	// The database itself refuses adding, removing or changing what a place is.
	ctx := context.Background()
	for _, sql := range []string{
		`DELETE FROM locations WHERE key = 'qc_area'`,
		`UPDATE locations SET holds_stock = true WHERE key = 'qc_area'`,
		`INSERT INTO locations (key, holds_stock, position, name, name_am) VALUES ('fg_store', true, 9, 'X', 'X')`,
	} {
		if _, err := f.e.pool.Exec(ctx, sql); err == nil {
			t.Errorf("allowed: %s", sql)
		}
	}
}

func TestEmployees_OptionalAccount(t *testing.T) {
	f := newFixture(t)
	_, qcUser := signIn(t, f.e, "meron@crown.example", "qc_inspector")
	op := mustID(t, f.e.do("POST", "/api/professions", `{"name":"Machine operator","name_am":"የማሽን ኦፕሬተር"}`, f.admin), 201)
	qc := mustID(t, f.e.do("POST", "/api/professions", `{"name":"QC inspector","name_am":"የጥራት ተቆጣጣሪ"}`, f.admin), 201)

	var emp struct {
		ID     string  `json:"id"`
		UserID *string `json:"user_id"`
		Email  *string `json:"email"`
		NameAm *string `json:"name_am"`
	}
	r := f.e.do("POST", "/api/employees", `{"full_name":"Tesfaye Girma","profession_id":"`+op+`"}`, f.admin)
	decode(t, r.Body.Bytes(), &emp)
	if r.Code != 201 || emp.UserID != nil || emp.NameAm != nil {
		t.Fatalf("operator without account = %d %s", r.Code, r.Body)
	}
	// Names may repeat: two people can share a name.
	if r := f.e.do("POST", "/api/employees", `{"full_name":"Tesfaye Girma","profession_id":"`+op+`"}`, f.admin); r.Code != 201 {
		t.Errorf("second person with the same name = %d", r.Code)
	}
	r = f.e.do("POST", "/api/employees", `{"full_name":"Meron Haile","name_am":"ሜሮን ኃይሌ","profession_id":"`+qc+`","user_id":"`+qcUser+`"}`, f.admin)
	decode(t, r.Body.Bytes(), &emp)
	if r.Code != 201 || emp.Email == nil || *emp.Email != "meron@crown.example" {
		t.Fatalf("employee with account = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("POST", "/api/employees", `{"full_name":"Someone else","profession_id":"`+qc+`","user_id":"`+qcUser+`"}`, f.admin); r.Code != 409 || errCode(r) != "account_linked" {
		t.Errorf("account linked twice = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("POST", "/api/employees", `{"full_name":"X","profession_id":"00000000-0000-0000-0000-000000000000"}`, f.admin); errCode(r) != "unknown_profession" {
		t.Errorf("unknown profession = %d %s", r.Code, r.Body)
	}
	if r := f.e.do("POST", "/api/employees", `{"full_name":"X","profession_id":"`+op+`","user_id":"00000000-0000-0000-0000-000000000000"}`, f.admin); errCode(r) != "unknown_user" {
		t.Errorf("unknown user = %d %s", r.Code, r.Body)
	}
	// Unlinking keeps the employee and their history.
	if r := f.e.do("PATCH", "/api/employees/"+emp.ID, `{"full_name":"Meron Haile","profession_id":"`+qc+`","user_id":null}`, f.admin); r.Code != 200 {
		t.Errorf("unlink = %d %s", r.Code, r.Body)
	}
	var profs []struct {
		Name      string `json:"name"`
		Employees int    `json:"employees"`
	}
	decode(t, f.e.do("GET", "/api/professions", "", f.admin).Body.Bytes(), &profs)
	for _, p := range profs {
		if p.Name == "Machine operator" && p.Employees != 2 {
			t.Errorf("operators = %d", p.Employees)
		}
	}
}

func TestSettings_Screen(t *testing.T) {
	f := newFixture(t)
	var got map[string]any
	decode(t, f.e.do("GET", "/api/settings", "", f.admin).Body.Bytes(), &got)
	want := map[string]any{"display_time_zone": "Africa/Addis_Ababa", "login_max_attempts": 5.0, "login_lockout_minutes": 15.0, "rest_rotation_minutes": 60.0, "bom_warn_pct": 5.0, "bom_crit_pct": 10.0}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
	bad := map[string]string{
		`{"rest_rotation_minutes":0}`:                         "out_of_range",
		`{"rest_rotation_minutes":"60"}`:                      "out_of_range",
		`{"bom_warn_pct":10}`:                                 "tolerance_order",
		`{"bom_warn_pct":8,"bom_crit_pct":7}`:                 "tolerance_order",
		`{"display_time_zone":"Mars/Olympus"}`:                "invalid_time_zone",
		`{"price_per_kg":5}`:                                  "unknown_setting",
		`{"rest_rotation_minutes":45,"login_max_attempts":0}`: "out_of_range",
	}
	for body, code := range bad {
		if r := f.e.do("PATCH", "/api/settings", body, f.admin); r.Code != 422 || errCode(r) != code {
			t.Errorf("%s = %d %s, want %s", body, r.Code, r.Body, code)
		}
	}
	if n := f.count(t, `SELECT count(*) FROM audit_log WHERE entity = 'settings'`); n != 0 {
		t.Errorf("refused changes wrote %d audit rows", n)
	}
	if r := f.e.do("PATCH", "/api/settings", `{"rest_rotation_minutes":45,"bom_warn_pct":5,"bom_crit_pct":12}`, f.admin); r.Code != 200 {
		t.Fatalf("update = %d %s", r.Code, r.Body)
	}
	// Two values changed; the unchanged warning tolerance writes no audit row.
	if n := f.count(t, `SELECT count(*) FROM audit_log WHERE entity = 'settings' AND actor = 'admin@crown.example'`); n != 2 {
		t.Errorf("audit rows = %d, want 2", n)
	}
	// The recipe screens now use the new default.
	var recipe struct {
		EffectiveCritPct string `json:"effective_crit_pct"`
	}
	f.save(f.greyColour, f.recipeBody(0, "First recipe.", ""))
	decode(t, f.e.do("GET", "/api/colours/"+f.greyColour+"/recipe", "", f.admin).Body.Bytes(), &recipe)
	if recipe.EffectiveCritPct != "12" {
		t.Errorf("recipe critical default = %s, want 12", recipe.EffectiveCritPct)
	}
}
