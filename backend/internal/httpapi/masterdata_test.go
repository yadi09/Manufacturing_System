package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

type idBody struct {
	ID      string `json:"id"`
	Colours []struct {
		ID string `json:"id"`
	} `json:"colours"`
}

func mustID(t *testing.T, rec *httptest.ResponseRecorder, want int) string {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d: %s", rec.Code, want, rec.Body)
	}
	var b idBody
	if err := json.Unmarshal(rec.Body.Bytes(), &b); err != nil {
		t.Fatal(err)
	}
	return b.ID
}

func errCode(rec *httptest.ResponseRecorder) string {
	var b struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &b)
	return b.Error
}

type fixture struct {
	e                       env
	admin                   *http.Cookie
	lldpe, grey             string // materials
	eggTray, jarCover       string // products
	greyColour, clearColour string
}

// newFixture builds Crown's two products and two materials through the real API.
func newFixture(t *testing.T) fixture {
	t.Helper()
	e := setup(t)
	admin, _ := signIn(t, e, "admin@crown.example", "admin")
	f := fixture{e: e, admin: admin}
	f.lldpe = mustID(t, e.do("POST", "/api/materials", `{"kind":"raw_material","name":"LLDPE M500026","name_am":"LLDPE M500026","unit":"kg","bag_qty":"25"}`, admin), 201)
	f.grey = mustID(t, e.do("POST", "/api/materials", `{"kind":"additive","name":"Grey masterbatch","name_am":"ግራጫ ማስተርባች","unit":"kg","bag_qty":"25"}`, admin), 201)
	f.eggTray = mustID(t, e.do("POST", "/api/products", `{"name":"Egg tray","name_am":"የእንቁላል ትሪ","sale_unit":"piece","package_qty":"30"}`, admin), 201)
	f.jarCover = mustID(t, e.do("POST", "/api/products", `{"name":"Jar cover","name_am":"የጀሪካን ክዳን","sale_unit":"kg","package_qty":"20","weight_per_piece_g":"8"}`, admin), 201)
	f.greyColour = mustID(t, e.do("POST", "/api/products/"+f.eggTray+"/colours", `{"name":"Grey","name_am":"ግራጫ"}`, admin), 201)
	f.clearColour = mustID(t, e.do("POST", "/api/products/"+f.jarCover+"/colours", `{"name":"Clear","name_am":"ግልጽ"}`, admin), 201)
	return f
}

func (f fixture) recipeBody(base int, reason string, extra string) string {
	return fmt.Sprintf(`{"base_version":%d,"reason":%q,"lines":[{"item_id":%q,"qty":"42","unit":"g"},{"item_id":%q,"qty":"0.8","unit":"g"}]%s}`, base, reason, f.lldpe, f.grey, extra)
}

func (f fixture) save(colour, body string) *httptest.ResponseRecorder {
	return f.e.do("POST", "/api/colours/"+colour+"/recipe/versions", body, f.admin)
}

func TestMasterData_Permissions(t *testing.T) {
	f := newFixture(t)
	pm, _ := signIn(t, f.e, "pm@crown.example", "production_manager")
	cash, _ := signIn(t, f.e, "cash@crown.example", "cashier")

	for _, p := range []string{"/api/materials", "/api/products"} {
		if r := f.e.do("GET", p, "", nil); r.Code != 401 {
			t.Errorf("anonymous GET %s = %d", p, r.Code)
		}
		if r := f.e.do("GET", p, "", pm); r.Code != 200 {
			t.Errorf("production manager may read %s: %d", p, r.Code)
		}
		if r := f.e.do("GET", p, "", cash); r.Code != 403 {
			t.Errorf("cashier GET %s = %d, want 403 (sales gets products in milestone 6)", p, r.Code)
		}
	}
	// Reading is not writing: only the administrator changes master data.
	writes := []struct{ method, path, body string }{
		{"POST", "/api/materials", `{"kind":"additive","name":"X","name_am":"X","unit":"kg"}`},
		{"POST", "/api/products", `{"name":"X","name_am":"X","sale_unit":"kg","package_qty":"1"}`},
		{"PATCH", "/api/products/" + f.eggTray, `{"name":"Egg tray","name_am":"x","sale_unit":"piece","package_qty":"30"}`},
		{"POST", "/api/products/" + f.eggTray + "/colours", `{"name":"Blue","name_am":"ሰማያዊ"}`},
		{"POST", "/api/colours/" + f.greyColour + "/recipe/versions", f.recipeBody(0, "first", "")},
	}
	for _, w := range writes {
		if r := f.e.do(w.method, w.path, w.body, pm); r.Code != 403 {
			t.Errorf("production manager %s %s = %d, want 403", w.method, w.path, r.Code)
		}
	}
}

func TestMasterData_ProductsCreateTheirAutomaticItems(t *testing.T) {
	f := newFixture(t)
	var regrind, finished int
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM items WHERE kind = 'regrind'`).Scan(&regrind)   //nolint:errcheck
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM items WHERE kind = 'finished'`).Scan(&finished) //nolint:errcheck
	if regrind != 2 || finished != 2 {
		t.Fatalf("one regrind item per product and one finished item per colour: regrind=%d finished=%d", regrind, finished)
	}
	// Their units follow the product: pieces for egg trays, kg for jar covers; regrind is always kg.
	var u string
	f.e.pool.QueryRow(context.Background(), `SELECT i.unit FROM items i JOIN variants v ON v.id = i.variant_id WHERE v.name = 'Grey'`).Scan(&u) //nolint:errcheck
	if u != "piece" {
		t.Fatalf("finished item unit = %q", u)
	}
	list := f.e.do("GET", "/api/products", "", f.admin)
	if !strings.Contains(list.Body.String(), `"active_version":null`) || strings.Contains(list.Body.String(), "argon") {
		t.Fatalf("a colour without a recipe reports active_version null: %s", list.Body)
	}
}

func TestMasterData_Validation(t *testing.T) {
	f := newFixture(t)
	cases := []struct {
		name, method, path, body string
		want                     int
		code                     string
	}{
		{"duplicate product (any case)", "POST", "/api/products", `{"name":"EGG TRAY","name_am":"x","sale_unit":"piece","package_qty":"30"}`, 409, "duplicate_name"},
		{"unit must be piece or kg", "POST", "/api/products", `{"name":"P","name_am":"p","sale_unit":"g","package_qty":"30"}`, 422, "invalid_input"},
		{"package must be positive", "POST", "/api/products", `{"name":"P","name_am":"p","sale_unit":"kg","package_qty":"0"}`, 422, "invalid_quantity"},
		{"package must be a number", "POST", "/api/products", `{"name":"P","name_am":"p","sale_unit":"kg","package_qty":"abc"}`, 422, "invalid_quantity"},
		{"both names required", "POST", "/api/products", `{"name":"P","name_am":"","sale_unit":"kg","package_qty":"1"}`, 422, "invalid_input"},
		{"duplicate colour", "POST", "/api/products/" + f.eggTray + "/colours", `{"name":"grey","name_am":"ግራጫ"}`, 409, "duplicate_name"},
		{"colour of an unknown product", "POST", "/api/products/00000000-0000-0000-0000-000000000000/colours", `{"name":"A","name_am":"a"}`, 404, "not_found"},
		{"duplicate material (any case)", "POST", "/api/materials", `{"kind":"raw_material","name":"lldpe m500026","name_am":"x","unit":"kg"}`, 409, "duplicate_name"},
		{"material kind", "POST", "/api/materials", `{"kind":"finished","name":"Z","name_am":"z","unit":"kg"}`, 422, "invalid_input"},
		{"material unit is mass", "POST", "/api/materials", `{"kind":"additive","name":"Z","name_am":"z","unit":"piece"}`, 422, "unit_not_allowed"},
		{"bag size positive", "POST", "/api/materials", `{"kind":"additive","name":"Z","name_am":"z","unit":"kg","bag_qty":"-5"}`, 422, "invalid_quantity"},
		{"unknown field", "POST", "/api/materials", `{"kind":"additive","name":"Z","name_am":"z","unit":"kg","price":"9"}`, 400, "bad_request"},
	}
	for _, c := range cases {
		rec := f.e.do(c.method, c.path, c.body, f.admin)
		if rec.Code != c.want || errCode(rec) != c.code {
			t.Errorf("%s: got %d %s, want %d %s", c.name, rec.Code, rec.Body, c.want, c.code)
		}
	}
}

func TestMasterData_UpdatesAreAudited(t *testing.T) {
	f := newFixture(t)
	if r := f.e.do("PATCH", "/api/products/"+f.jarCover, `{"name":"Jar cover","name_am":"የጀሪካን ክዳን","sale_unit":"kg","package_qty":"25","weight_per_piece_g":"8"}`, f.admin); r.Code != 200 {
		t.Fatalf("update = %d %s", r.Code, r.Body)
	}
	var actor, oldV, newV string
	err := f.e.pool.QueryRow(context.Background(), `SELECT actor, old_value::text, new_value::text FROM audit_log WHERE entity = 'products' AND action = 'update'`).Scan(&actor, &oldV, &newV)
	if err != nil || actor != "admin@crown.example" || !strings.Contains(oldV, `"20.000"`) || !strings.Contains(newV, `"25.000"`) {
		t.Fatalf("audit = %s %s %s %v", actor, oldV, newV, err)
	}
	// Saving the same values again writes nothing.
	f.e.do("PATCH", "/api/products/"+f.jarCover, `{"name":"Jar cover","name_am":"የጀሪካን ክዳን","sale_unit":"kg","package_qty":"25","weight_per_piece_g":"8"}`, f.admin)
	var n int
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE entity = 'products' AND action = 'update'`).Scan(&n) //nolint:errcheck
	if n != 1 {
		t.Fatalf("an unchanged save must not add an audit row: %d", n)
	}
	// Retiring a colour and a material keeps them, and is audited.
	f.e.do("PATCH", "/api/colours/"+f.clearColour, `{"name":"Clear","name_am":"ግልጽ","active":false}`, f.admin)
	f.e.do("PATCH", "/api/materials/"+f.grey, `{"name":"Grey masterbatch","name_am":"ግራጫ ማስተርባች","bag_qty":"25","active":false}`, f.admin)
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE entity IN ('colours','materials') AND action = 'update'`).Scan(&n) //nolint:errcheck
	if n != 2 {
		t.Fatalf("retiring must be audited, rows = %d", n)
	}
}

func TestRecipe_VersionsAreAppendOnly(t *testing.T) {
	f := newFixture(t)

	if r := f.e.do("GET", "/api/colours/"+f.greyColour+"/recipe", "", f.admin); r.Code != 404 || errCode(r) != "no_recipe" {
		t.Fatalf("no recipe yet: %d %s", r.Code, r.Body)
	}
	v1 := f.save(f.greyColour, f.recipeBody(0, "First recipe.", fmt.Sprintf(`,"regrind":[{"source_product_id":%q},{"source_product_id":%q}]`, f.eggTray, f.jarCover)))
	if v1.Code != 201 {
		t.Fatalf("v1 = %d %s", v1.Code, v1.Body)
	}
	v2 := f.save(f.greyColour, strings.Replace(f.recipeBody(1, "Masterbatch corrected after a weighing test.", ""), `"qty":"0.8"`, `"qty":"0.85"`, 1))
	if v2.Code != 201 || !strings.Contains(v2.Body.String(), `"version":2`) {
		t.Fatalf("v2 = %d %s", v2.Code, v2.Body)
	}

	// Version 2 is in use, and version 1 is kept exactly as it was.
	cur := f.e.do("GET", "/api/colours/"+f.greyColour+"/recipe", "", f.admin).Body.String()
	if !strings.Contains(cur, `"version":2`) || !strings.Contains(cur, `"status":"active"`) || !strings.Contains(cur, "0.850000") || strings.Contains(cur, "First recipe") {
		t.Fatalf("current recipe: %s", cur)
	}
	old := f.e.do("GET", "/api/colours/"+f.greyColour+"/recipe/versions/1", "", f.admin).Body.String()
	if !strings.Contains(old, `"status":"replaced"`) || !strings.Contains(old, "0.800000") || !strings.Contains(old, "First recipe.") || strings.Count(old, "source_product_id") != 2 {
		t.Fatalf("version 1 must be unchanged with its two regrind rules: %s", old)
	}
	// v2 did not carry the regrind rules over: a rule that is not sent is not allowed.
	if strings.Contains(cur, `"source_product_id"`) {
		t.Fatalf("version 2 sent no regrind rule, so none is allowed: %s", cur)
	}
	hist := f.e.do("GET", "/api/colours/"+f.greyColour+"/recipe/versions", "", f.admin).Body.String()
	if strings.Index(hist, `"version":2`) > strings.Index(hist, `"version":1`) || !strings.Contains(hist, "Masterbatch corrected") {
		t.Fatalf("history is newest first with reasons: %s", hist)
	}
	if r := f.e.do("GET", "/api/colours/"+f.greyColour+"/recipe/versions/9", "", f.admin); r.Code != 404 {
		t.Fatalf("unknown version = %d", r.Code)
	}
}

func TestRecipe_TheDatabaseItselfRefusesToRewriteHistory(t *testing.T) {
	f := newFixture(t)
	f.save(f.greyColour, f.recipeBody(0, "First recipe.", fmt.Sprintf(`,"regrind":[{"source_product_id":%q}]`, f.jarCover)))
	ctx := context.Background()
	for _, sql := range []string{
		`UPDATE bom_lines SET qty = 1`, `DELETE FROM bom_lines`,
		`UPDATE bom_regrind_rules SET max_blend_pct = 50`, `DELETE FROM bom_regrind_rules`,
		`UPDATE boms SET reason = 'edited'`, `DELETE FROM boms`,
		`UPDATE boms SET status = 'replaced'`, // even the allowed transition needs replaced_at
	} {
		if _, err := f.e.pool.Exec(ctx, sql); err == nil {
			t.Errorf("%q must be rejected: recipes are append-only", sql)
		}
	}
}

func TestRecipe_ASaveFromAnOldVersionIsRefusedAndChangesNothing(t *testing.T) {
	f := newFixture(t)
	f.save(f.greyColour, f.recipeBody(0, "First recipe.", ""))
	f.save(f.greyColour, f.recipeBody(1, "Second.", ""))

	stale := f.save(f.greyColour, f.recipeBody(1, "Edited while someone else saved.", ""))
	if stale.Code != 409 || errCode(stale) != "version_conflict" {
		t.Fatalf("stale save = %d %s", stale.Code, stale.Body)
	}
	if first := f.save(f.clearColour, f.recipeBody(3, "no such base", "")); first.Code != 409 {
		t.Fatalf("a first recipe must start from version 0: %d", first.Code)
	}
	var n int
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM boms`).Scan(&n) //nolint:errcheck
	if n != 2 {
		t.Fatalf("refused saves must write nothing, versions = %d", n)
	}
}

func TestRecipe_TwoSavesAtTheSameMomentOnlyOneWins(t *testing.T) {
	f := newFixture(t)
	f.save(f.greyColour, f.recipeBody(0, "First recipe.", ""))

	for round := 0; round < 15; round++ {
		base := round + 1
		var wg sync.WaitGroup
		codes := make(chan int, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				codes <- f.save(f.greyColour, f.recipeBody(base, fmt.Sprintf("race %d.%d", round, i), "")).Code
			}(i)
		}
		wg.Wait()
		close(codes)
		var created, conflict int
		for c := range codes {
			switch c {
			case 201:
				created++
			case 409:
				conflict++
			default:
				t.Fatalf("round %d: unexpected status %d", round, c)
			}
		}
		if created != 1 || conflict != 1 {
			t.Fatalf("round %d: created=%d conflict=%d, want exactly one of each", round, created, conflict)
		}
	}
	var active int
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM boms WHERE status = 'active'`).Scan(&active) //nolint:errcheck
	if active != 1 {
		t.Fatalf("exactly one version is in use, got %d", active)
	}
}

func TestRecipe_ValidationRules(t *testing.T) {
	f := newFixture(t)
	f.e.do("PATCH", "/api/materials/"+f.grey, `{"name":"Grey masterbatch","name_am":"ግራጫ ማስተርባች","bag_qty":"25","active":false}`, f.admin)
	var finishedItem, regrindItem string
	f.e.pool.QueryRow(context.Background(), `SELECT id::text FROM items WHERE kind = 'finished' LIMIT 1`).Scan(&finishedItem) //nolint:errcheck
	f.e.pool.QueryRow(context.Background(), `SELECT id::text FROM items WHERE kind = 'regrind' LIMIT 1`).Scan(&regrindItem)   //nolint:errcheck
	line := func(item, qty, unit string) string {
		return fmt.Sprintf(`{"item_id":%q,"qty":%q,"unit":%q}`, item, qty, unit)
	}
	body := func(reason string, lines string, extra string) string {
		return fmt.Sprintf(`{"base_version":0,"reason":%q,"lines":[%s]%s}`, reason, lines, extra)
	}
	ok := line(f.lldpe, "42", "g")
	cases := []struct{ name, body, code string }{
		{"reason required", body("   ", ok, ""), "reason_required"},
		{"at least one ingredient", body("r", "", ""), "no_ingredients"},
		{"same material twice", body("r", ok+","+line(f.lldpe, "1", "kg"), ""), "duplicate_ingredient"},
		{"zero quantity", body("r", line(f.lldpe, "0", "g"), ""), "invalid_quantity"},
		{"negative quantity", body("r", line(f.lldpe, "-1", "g"), ""), "invalid_quantity"},
		{"not a number", body("r", line(f.lldpe, "lots", "g"), ""), "invalid_quantity"},
		{"too many decimals", body("r", line(f.lldpe, "1.1234567", "g"), ""), "invalid_quantity"},
		{"unit must be mass", body("r", line(f.lldpe, "1", "piece"), ""), "unit_not_allowed"},
		{"unknown material", body("r", line("00000000-0000-0000-0000-000000000000", "1", "g"), ""), "unknown_item"},
		{"a finished-goods item is not an ingredient", body("r", line(finishedItem, "1", "g"), ""), "unknown_item"},
		{"regrind is set by rules, not as an ingredient", body("r", line(regrindItem, "1", "g"), ""), "unknown_item"},
		{"a retired material cannot be added", body("r", line(f.grey, "1", "g"), ""), "unknown_item"},
		{"regrind blend over 100", body("r", ok, fmt.Sprintf(`,"regrind":[{"source_product_id":%q,"max_blend_pct":"101"}]`, f.eggTray)), "invalid_blend"},
		{"regrind blend zero", body("r", ok, fmt.Sprintf(`,"regrind":[{"source_product_id":%q,"max_blend_pct":"0"}]`, f.eggTray)), "invalid_blend"},
		{"regrind blend text", body("r", ok, fmt.Sprintf(`,"regrind":[{"source_product_id":%q,"max_blend_pct":"half"}]`, f.eggTray)), "invalid_blend"},
		{"same regrind source twice", body("r", ok, fmt.Sprintf(`,"regrind":[{"source_product_id":%q},{"source_product_id":%q}]`, f.eggTray, f.eggTray)), "duplicate_regrind_source"},
		{"unknown regrind source", body("r", ok, `,"regrind":[{"source_product_id":"00000000-0000-0000-0000-000000000000"}]`), "unknown_regrind_source"},
		{"warning must be below critical", body("r", ok, `,"warn_pct":"10","crit_pct":"5"`), "invalid_tolerance"},
		{"tolerance over 100", body("r", ok, `,"crit_pct":"150"`), "invalid_tolerance"},
	}
	for _, c := range cases {
		rec := f.save(f.greyColour, c.body)
		if rec.Code != 422 || errCode(rec) != c.code {
			t.Errorf("%s: got %d %s, want 422 %s", c.name, rec.Code, rec.Body, c.code)
		}
	}
	var n int
	f.e.pool.QueryRow(context.Background(), `SELECT count(*) FROM boms`).Scan(&n) //nolint:errcheck
	if n != 0 {
		t.Fatalf("no failed save may leave a version behind: %d", n)
	}
}

func TestRecipe_RegrindRulesAndTolerances(t *testing.T) {
	f := newFixture(t)
	// Crown's setup: egg trays may use regrind from egg trays and from jar covers; jar covers none.
	egg := f.save(f.greyColour, f.recipeBody(0, "First recipe.", fmt.Sprintf(`,"regrind":[{"source_product_id":%q},{"source_product_id":%q,"max_blend_pct":"30"}]`, f.eggTray, f.jarCover)))
	if egg.Code != 201 {
		t.Fatalf("%d %s", egg.Code, egg.Body)
	}
	jar := f.save(f.clearColour, fmt.Sprintf(`{"base_version":0,"reason":"First recipe.","lines":[{"item_id":%q,"qty":"1","unit":"kg"}]}`, f.lldpe))
	if jar.Code != 201 {
		t.Fatalf("%d %s", jar.Code, jar.Body)
	}
	var eggR, jarR struct {
		Regrind []struct {
			Name        string  `json:"name"`
			MaxBlendPct *string `json:"max_blend_pct"`
		} `json:"regrind"`
		EffectiveWarn, EffectiveCrit string
		Warn                         string `json:"effective_warn_pct"`
		Crit                         string `json:"effective_crit_pct"`
	}
	json.Unmarshal(egg.Body.Bytes(), &eggR) //nolint:errcheck
	json.Unmarshal(jar.Body.Bytes(), &jarR) //nolint:errcheck
	if len(eggR.Regrind) != 2 || len(jarR.Regrind) != 0 {
		t.Fatalf("egg tray accepts two regrind sources, jar cover none: %d and %d", len(eggR.Regrind), len(jarR.Regrind))
	}
	var capped, uncapped int
	for _, r := range eggR.Regrind {
		if r.MaxBlendPct == nil {
			uncapped++
		} else if *r.MaxBlendPct == "30.00" {
			capped++
		}
	}
	if capped != 1 || uncapped != 1 {
		t.Fatalf("one rule has a 30%% cap and one has none: %+v", eggR.Regrind)
	}
	// Tolerances come from settings (5 and 10) unless the recipe sets its own.
	if eggR.Warn != "5" || eggR.Crit != "10" {
		t.Fatalf("defaults from settings: %s / %s", eggR.Warn, eggR.Crit)
	}
	own := f.save(f.greyColour, f.recipeBody(1, "Tighter limits.", `,"warn_pct":"3","crit_pct":"6"`))
	json.Unmarshal(own.Body.Bytes(), &eggR) //nolint:errcheck
	if eggR.Warn != "3.00" || eggR.Crit != "6.00" {
		t.Fatalf("recipe's own tolerances: %s / %s (%s)", eggR.Warn, eggR.Crit, own.Body)
	}
	f.e.pool.Exec(context.Background(), `UPDATE settings SET value = '7' WHERE key = 'bom_warn_pct'`) //nolint:errcheck
	jarNow := f.e.do("GET", "/api/colours/"+f.clearColour+"/recipe", "", f.admin).Body.String()
	if !strings.Contains(jarNow, `"effective_warn_pct":"7"`) {
		t.Fatalf("changing the setting changes the default: %s", jarNow)
	}
}

func TestRecipe_TheSaleUnitIsLockedOnceARecipeExists(t *testing.T) {
	f := newFixture(t)
	change := `{"name":"Jar cover","name_am":"የጀሪካን ክዳን","sale_unit":"piece","package_qty":"20"}`
	// No recipe yet on a brand-new product: the unit may still change.
	fresh := mustID(t, f.e.do("POST", "/api/products", `{"name":"Lid","name_am":"ክዳን","sale_unit":"kg","package_qty":"5"}`, f.admin), 201)
	if r := f.e.do("PATCH", "/api/products/"+fresh, `{"name":"Lid","name_am":"ክዳን","sale_unit":"piece","package_qty":"5"}`, f.admin); r.Code != 200 {
		t.Fatalf("unit before any recipe = %d %s", r.Code, r.Body)
	}
	f.save(f.clearColour, fmt.Sprintf(`{"base_version":0,"reason":"First recipe.","lines":[{"item_id":%q,"qty":"1","unit":"kg"}]}`, f.lldpe))
	if r := f.e.do("PATCH", "/api/products/"+f.jarCover, change, f.admin); r.Code != 409 || errCode(r) != "unit_locked" {
		t.Fatalf("unit after a recipe = %d %s", r.Code, r.Body)
	}
	// Everything else may still change, and the database enforces the lock too.
	if r := f.e.do("PATCH", "/api/products/"+f.jarCover, `{"name":"Jar cover","name_am":"የጀሪካን ክዳን","sale_unit":"kg","package_qty":"22"}`, f.admin); r.Code != 200 {
		t.Fatalf("other fields = %d %s", r.Code, r.Body)
	}
	if _, err := f.e.pool.Exec(context.Background(), `UPDATE products SET sale_unit = 'piece' WHERE id = $1`, f.jarCover); err == nil {
		t.Fatal("the database must refuse the unit change too")
	}
}

func TestRecipe_NewVersionsAreAudited(t *testing.T) {
	f := newFixture(t)
	f.save(f.greyColour, f.recipeBody(0, "First recipe.", ""))
	f.save(f.greyColour, f.recipeBody(1, "Second.", ""))
	rows, err := f.e.pool.Query(context.Background(), `SELECT actor, COALESCE(old_value::text, ''), new_value::text FROM audit_log WHERE entity = 'recipes' AND action = 'new_version' ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got [][3]string
	for rows.Next() {
		var r [3]string
		rows.Scan(&r[0], &r[1], &r[2]) //nolint:errcheck
		got = append(got, r)
	}
	if len(got) != 2 || got[0][0] != "admin@crown.example" || got[0][1] != "" || !strings.Contains(got[0][2], "First recipe.") ||
		!strings.Contains(got[1][1], `"version": 1`) || !strings.Contains(got[1][2], `"version": 2`) || !strings.Contains(got[1][2], "LLDPE M500026") {
		t.Fatalf("audit rows: %+v", got)
	}
}

func TestMaterials_UsageIsCounted(t *testing.T) {
	f := newFixture(t)
	f.save(f.greyColour, f.recipeBody(0, "First recipe.", ""))
	f.save(f.greyColour, f.recipeBody(1, "Second.", "")) // the old version does not count
	list := f.e.do("GET", "/api/materials", "", f.admin).Body.String()
	var mats []struct {
		Name   string `json:"name"`
		UsedIn int    `json:"used_in"`
	}
	json.Unmarshal([]byte(list), &mats) //nolint:errcheck
	used := map[string]int{}
	for _, m := range mats {
		used[m.Name] = m.UsedIn
	}
	if used["LLDPE M500026"] != 1 || used["Grey masterbatch"] != 1 {
		t.Fatalf("only recipes in use count: %v", used)
	}
}
