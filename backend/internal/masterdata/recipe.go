package masterdata

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
	"github.com/yadi09/Manufacturing_System/backend/internal/settings"
)

// recipeOf builds the full recipe of one version.
func (s *Service) recipeOf(ctx context.Context, q *db.Queries, colourID pgtype.UUID, bom bomRow) (Recipe, error) {
	v, err := q.GetVariant(ctx, colourID)
	if err != nil {
		return Recipe{}, err
	}
	p, err := s.product(ctx, q, v.ProductID)
	if err != nil {
		return Recipe{}, err
	}
	lines, err := q.ListBomLines(ctx, bom.ID)
	if err != nil {
		return Recipe{}, err
	}
	rules, err := q.ListBomRules(ctx, bom.ID)
	if err != nil {
		return Recipe{}, err
	}
	warn, err := s.settings.Int(ctx, settings.KeyBomWarnPct, 5)
	if err != nil {
		return Recipe{}, err
	}
	crit, err := s.settings.Int(ctx, settings.KeyBomCritPct, 10)
	if err != nil {
		return Recipe{}, err
	}
	r := Recipe{
		ColourID: uuidString(colourID), Version: int(bom.Version), Status: bom.Status, Reason: bom.Reason, CreatedBy: bom.CreatedBy,
		CreatedAt: bom.CreatedAt.Time, SaleUnit: p.SaleUnit, Lines: []Line{}, Regrind: []Rule{},
		WarnPct: nilIfEmpty(bom.WarnPct), CritPct: nilIfEmpty(bom.CritPct),
		EffectiveWarnPct: strconv.Itoa(warn), EffectiveCritPct: strconv.Itoa(crit),
	}
	if bom.ReplacedAt.Valid {
		t := bom.ReplacedAt.Time
		r.ReplacedAt = &t
	}
	if r.WarnPct != nil {
		r.EffectiveWarnPct = *r.WarnPct
	}
	if r.CritPct != nil {
		r.EffectiveCritPct = *r.CritPct
	}
	for _, l := range lines {
		r.Lines = append(r.Lines, Line{ItemID: uuidString(l.ItemID), Kind: l.Kind, Name: l.Name.String, NameAm: l.NameAm.String, Qty: l.Qty, Unit: l.Unit})
	}
	for _, ru := range rules {
		r.Regrind = append(r.Regrind, Rule{SourceProductID: uuidString(ru.SourceProductID), Name: ru.Name, NameAm: ru.NameAm, MaxBlendPct: nilIfEmpty(ru.MaxBlendPct)})
	}
	return r, nil
}

type bomRow struct {
	ID         pgtype.UUID
	Version    int32
	Status     string
	Reason     string
	CreatedBy  string
	CreatedAt  pgtype.Timestamptz
	ReplacedAt pgtype.Timestamptz
	WarnPct    string
	CritPct    string
}

// GetRecipe returns the version in use for a colour, or CodeNoRecipe.
func (s *Service) GetRecipe(ctx context.Context, colourID string) (Recipe, error) {
	cid, err := parseUUID(colourID)
	if err != nil {
		return Recipe{}, err
	}
	q := db.New(s.pool)
	if _, err := q.GetVariant(ctx, cid); errors.Is(err, pgx.ErrNoRows) {
		return Recipe{}, fail(CodeNotFound)
	}
	b, err := q.GetActiveBom(ctx, cid)
	if errors.Is(err, pgx.ErrNoRows) {
		return Recipe{}, fail(CodeNoRecipe)
	}
	if err != nil {
		return Recipe{}, err
	}
	return s.recipeOf(ctx, q, cid, bomRow{b.ID, b.Version, b.Status, b.Reason, b.CreatedBy, b.CreatedAt, b.ReplacedAt, b.WarnPct, b.CritPct})
}

// GetRecipeVersion returns any version, active or replaced.
func (s *Service) GetRecipeVersion(ctx context.Context, colourID string, version int) (Recipe, error) {
	cid, err := parseUUID(colourID)
	if err != nil {
		return Recipe{}, err
	}
	q := db.New(s.pool)
	b, err := q.GetBomVersion(ctx, db.GetBomVersionParams{VariantID: cid, Version: int32(version)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Recipe{}, fail(CodeNotFound)
	}
	if err != nil {
		return Recipe{}, err
	}
	return s.recipeOf(ctx, q, cid, bomRow{b.ID, b.Version, b.Status, b.Reason, b.CreatedBy, b.CreatedAt, b.ReplacedAt, b.WarnPct, b.CritPct})
}

func (s *Service) ListRecipeVersions(ctx context.Context, colourID string) ([]VersionSummary, error) {
	cid, err := parseUUID(colourID)
	if err != nil {
		return nil, err
	}
	q := db.New(s.pool)
	if _, err := q.GetVariant(ctx, cid); errors.Is(err, pgx.ErrNoRows) {
		return nil, fail(CodeNotFound)
	}
	rows, err := q.ListBomVersions(ctx, cid)
	if err != nil {
		return nil, err
	}
	out := make([]VersionSummary, 0, len(rows))
	for _, r := range rows {
		v := VersionSummary{Version: int(r.Version), Status: r.Status, Reason: r.Reason, CreatedBy: r.CreatedBy, CreatedAt: r.CreatedAt.Time}
		if r.ReplacedAt.Valid {
			t := r.ReplacedAt.Time
			v.ReplacedAt = &t
		}
		out = append(out, v)
	}
	return out, nil
}

// SaveRecipe creates the next version of a colour's recipe and makes it the one in use.
// Earlier versions are kept exactly as they were. A save is refused, and nothing changes, when
// the editor's base version is not the latest (someone saved first) or any rule is broken.
func (s *Service) SaveRecipe(ctx context.Context, actor, colourID string, in NewRecipe) (Recipe, error) {
	cid, err := parseUUID(colourID)
	if err != nil {
		return Recipe{}, err
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		return Recipe{}, fail(CodeReasonRequired)
	}
	if len(in.Lines) == 0 {
		return Recipe{}, fail(CodeNoIngredients)
	}
	warn, warnR, ok := optionalPct(in.WarnPct)
	if !ok {
		return Recipe{}, fail(CodeInvalidTol)
	}
	crit, critR, ok := optionalPct(in.CritPct)
	if !ok {
		return Recipe{}, fail(CodeInvalidTol)
	}
	if warnR != nil && critR != nil && warnR.Cmp(critR) >= 0 {
		return Recipe{}, fail(CodeInvalidTol)
	}

	tx, q, err := s.begin(ctx)
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Locking the colour makes two simultaneous saves take turns; the second sees the first's version.
	if _, err := q.LockVariant(ctx, cid); errors.Is(err, pgx.ErrNoRows) {
		return Recipe{}, fail(CodeNotFound)
	} else if err != nil {
		return Recipe{}, err
	}
	latest, err := q.LatestBomVersion(ctx, cid)
	if err != nil {
		return Recipe{}, err
	}
	if int32(in.BaseVersion) != latest {
		return Recipe{}, fail(CodeVersionConflict)
	}

	type line struct {
		id        pgtype.UUID
		qty, unit string
	}
	seen := map[string]bool{}
	var lines []line
	for _, l := range in.Lines {
		id, err := parseUUID(l.ItemID)
		if err != nil {
			return Recipe{}, fail(CodeUnknownItem)
		}
		if seen[l.ItemID] {
			return Recipe{}, fail(CodeDuplicateLine)
		}
		seen[l.ItemID] = true
		item, err := q.GetItemForRecipe(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.Kind != "raw_material" && item.Kind != "additive") || (err == nil && !item.Active) {
			return Recipe{}, fail(CodeUnknownItem)
		}
		if err != nil {
			return Recipe{}, err
		}
		qty, _, ok := parseDecimal(l.Qty, 6)
		if !ok {
			return Recipe{}, fail(CodeInvalidQuantity)
		}
		if l.Unit != "g" && l.Unit != "kg" {
			return Recipe{}, fail(CodeUnitNotAllowed)
		}
		lines = append(lines, line{id, qty, l.Unit})
	}

	type rule struct {
		source pgtype.UUID
		max    *string
	}
	seenSrc := map[string]bool{}
	var rules []rule
	for _, r := range in.Regrind {
		src, err := parseUUID(r.SourceProductID)
		if err != nil {
			return Recipe{}, fail(CodeUnknownSource)
		}
		if seenSrc[r.SourceProductID] {
			return Recipe{}, fail(CodeDuplicateRule)
		}
		seenSrc[r.SourceProductID] = true
		if _, err := q.GetProduct(ctx, src); errors.Is(err, pgx.ErrNoRows) {
			return Recipe{}, fail(CodeUnknownSource)
		} else if err != nil {
			return Recipe{}, err
		}
		max, _, ok := optionalPct(r.MaxBlendPct)
		if !ok {
			return Recipe{}, fail(CodeInvalidBlend)
		}
		rules = append(rules, rule{src, max})
	}

	if err := q.MarkBomReplaced(ctx, cid); err != nil {
		return Recipe{}, err
	}
	version := latest + 1
	bom, err := q.InsertBom(ctx, db.InsertBomParams{VariantID: cid, Version: version, Reason: reason, CreatedBy: actor, WarnPct: ptrText(warn), CritPct: ptrText(crit)})
	if err != nil {
		return Recipe{}, err
	}
	for _, l := range lines {
		if err := q.InsertBomLine(ctx, db.InsertBomLineParams{BomID: bom.ID, ItemID: l.id, Qty: l.qty, Unit: l.unit}); err != nil {
			return Recipe{}, err
		}
	}
	for _, r := range rules {
		if err := q.InsertBomRule(ctx, db.InsertBomRuleParams{BomID: bom.ID, SourceProductID: r.source, MaxBlendPct: ptrText(r.max)}); err != nil {
			return Recipe{}, err
		}
	}
	// Read it back, so the answer is exactly what every later read will say.
	stored, err := q.GetBomVersion(ctx, db.GetBomVersionParams{VariantID: cid, Version: version})
	if err != nil {
		return Recipe{}, err
	}
	saved, err := s.recipeOf(ctx, q, cid, bomRow{stored.ID, stored.Version, stored.Status, stored.Reason, stored.CreatedBy, stored.CreatedAt, stored.ReplacedAt, stored.WarnPct, stored.CritPct})
	if err != nil {
		return Recipe{}, err
	}
	var old any
	if latest > 0 {
		old = map[string]any{"version": latest}
	}
	if err := audit(ctx, q, actor, "new_version", "recipes", colourID, old, saved); err != nil {
		return Recipe{}, err
	}
	return saved, tx.Commit(ctx)
}
