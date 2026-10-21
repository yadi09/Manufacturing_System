package masterdata

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
	"github.com/yadi09/Manufacturing_System/backend/internal/settings"
)

type Service struct {
	pool     *pgxpool.Pool
	settings *settings.Store
}

func New(pool *pgxpool.Pool) *Service { return &Service{pool: pool, settings: settings.New(pool)} }

// ---------- helpers ----------

func uuidString(u pgtype.UUID) string {
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return u, fail(CodeNotFound)
	}
	return u, nil
}

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: true} }

func ptrText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return text(*s)
}

func isUnique(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func toJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func audit(ctx context.Context, q *db.Queries, actor, action, entity, id string, oldV, newV any) error {
	var o []byte
	if oldV != nil {
		o = toJSON(oldV)
	}
	_, err := q.InsertAudit(ctx, db.InsertAuditParams{Actor: actor, Action: action, Entity: entity, EntityID: id, OldValue: o, NewValue: toJSON(newV)})
	return err
}

func (s *Service) begin(ctx context.Context) (pgx.Tx, *db.Queries, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	return tx, db.New(tx), nil
}

func names(name, nameAm string) (string, string, error) {
	name, nameAm = strings.TrimSpace(name), strings.TrimSpace(nameAm)
	if name == "" || nameAm == "" || len(name) > 120 || len(nameAm) > 120 {
		return "", "", fail(CodeInvalidInput)
	}
	return name, nameAm, nil
}

func isSaleUnit(u string) bool { return u == "piece" || u == "kg" }

// ---------- materials ----------

func materialFrom(id pgtype.UUID, kind string, name, nameAm pgtype.Text, unit, bag string, active bool, usedIn int64) Material {
	return Material{ID: uuidString(id), Kind: kind, Name: name.String, NameAm: nameAm.String, Unit: unit, BagQty: nilIfEmpty(bag), Active: active, UsedIn: int(usedIn)}
}

func (s *Service) ListMaterials(ctx context.Context) ([]Material, error) {
	rows, err := db.New(s.pool).ListMaterials(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Material, 0, len(rows))
	for _, r := range rows {
		out = append(out, materialFrom(r.ID, r.Kind, r.Name, r.NameAm, r.Unit, r.BagQty, r.Active, r.UsedIn))
	}
	return out, nil
}

func (s *Service) material(ctx context.Context, q *db.Queries, id pgtype.UUID) (Material, error) {
	r, err := q.GetMaterial(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Material{}, fail(CodeNotFound)
	}
	if err != nil {
		return Material{}, err
	}
	return materialFrom(r.ID, r.Kind, r.Name, r.NameAm, r.Unit, r.BagQty, r.Active, 0), nil
}

func validateMaterial(in MaterialInput, creating bool) (name, nameAm string, bag *string, err error) {
	if name, nameAm, err = names(in.Name, in.NameAm); err != nil {
		return
	}
	if creating && in.Kind != "raw_material" && in.Kind != "additive" {
		return "", "", nil, fail(CodeInvalidInput)
	}
	if in.BagQty != nil && strings.TrimSpace(*in.BagQty) != "" {
		v, _, ok := parseDecimal(*in.BagQty, 3)
		if !ok {
			return "", "", nil, fail(CodeInvalidQuantity)
		}
		bag = &v
	}
	return
}

func (s *Service) CreateMaterial(ctx context.Context, actor string, in MaterialInput) (Material, error) {
	name, nameAm, bag, err := validateMaterial(in, true)
	if err != nil {
		return Material{}, err
	}
	if in.Unit == "" {
		in.Unit = "kg"
	}
	if in.Unit != "kg" && in.Unit != "g" {
		return Material{}, fail(CodeUnitNotAllowed)
	}
	tx, q, err := s.begin(ctx)
	if err != nil {
		return Material{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	id, err := q.CreateMaterial(ctx, db.CreateMaterialParams{Kind: in.Kind, Name: text(name), NameAm: text(nameAm), Unit: in.Unit, BagQty: ptrText(bag)})
	if isUnique(err) {
		return Material{}, fail(CodeDuplicateName)
	}
	if err != nil {
		return Material{}, err
	}
	m, err := s.material(ctx, q, id)
	if err != nil {
		return Material{}, err
	}
	if err := audit(ctx, q, actor, "create", "materials", m.ID, nil, m); err != nil {
		return Material{}, err
	}
	return m, tx.Commit(ctx)
}

func (s *Service) UpdateMaterial(ctx context.Context, actor, id string, in MaterialInput) (Material, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Material{}, err
	}
	name, nameAm, bag, err := validateMaterial(in, false)
	if err != nil {
		return Material{}, err
	}
	tx, q, err := s.begin(ctx)
	if err != nil {
		return Material{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	before, err := s.material(ctx, q, uid)
	if err != nil {
		return Material{}, err
	}
	active := before.Active
	if in.Active != nil {
		active = *in.Active
	}
	err = q.UpdateMaterial(ctx, db.UpdateMaterialParams{ID: uid, Name: text(name), NameAm: text(nameAm), BagQty: ptrText(bag), Active: active})
	if isUnique(err) {
		return Material{}, fail(CodeDuplicateName)
	}
	if err != nil {
		return Material{}, err
	}
	after, err := s.material(ctx, q, uid)
	if err != nil {
		return Material{}, err
	}
	if string(toJSON(before)) != string(toJSON(after)) {
		if err := audit(ctx, q, actor, "update", "materials", id, before, after); err != nil {
			return Material{}, err
		}
	}
	return after, tx.Commit(ctx)
}

// ---------- products and colours ----------

func (s *Service) ListProducts(ctx context.Context) ([]Product, error) {
	q := db.New(s.pool)
	prods, err := q.ListProducts(ctx)
	if err != nil {
		return nil, err
	}
	vars, err := q.ListVariants(ctx)
	if err != nil {
		return nil, err
	}
	byProduct := map[string][]Colour{}
	for _, v := range vars {
		c := Colour{ID: uuidString(v.ID), ProductID: uuidString(v.ProductID), Name: v.Name, NameAm: v.NameAm, Active: v.Active}
		if v.ActiveVersion > 0 {
			ver := int(v.ActiveVersion)
			c.ActiveVersion = &ver
		}
		byProduct[c.ProductID] = append(byProduct[c.ProductID], c)
	}
	out := make([]Product, 0, len(prods))
	for _, p := range prods {
		id := uuidString(p.ID)
		cols := byProduct[id]
		if cols == nil {
			cols = []Colour{}
		}
		out = append(out, Product{ID: id, Name: p.Name, NameAm: p.NameAm, SaleUnit: p.SaleUnit, PackageQty: p.PackageQty, WeightPerPieceG: nilIfEmpty(p.WeightPerPieceG), Active: p.Active, Colours: cols})
	}
	return out, nil
}

func (s *Service) product(ctx context.Context, q *db.Queries, id pgtype.UUID) (Product, error) {
	p, err := q.GetProduct(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, fail(CodeNotFound)
	}
	if err != nil {
		return Product{}, err
	}
	return Product{ID: uuidString(p.ID), Name: p.Name, NameAm: p.NameAm, SaleUnit: p.SaleUnit, PackageQty: p.PackageQty, WeightPerPieceG: nilIfEmpty(p.WeightPerPieceG), Active: p.Active, Colours: []Colour{}}, nil
}

func validateProduct(in ProductInput) (name, nameAm, pkg string, weight *string, err error) {
	if name, nameAm, err = names(in.Name, in.NameAm); err != nil {
		return
	}
	if !isSaleUnit(in.SaleUnit) {
		return "", "", "", nil, fail(CodeInvalidInput)
	}
	var ok bool
	if pkg, _, ok = parseDecimal(in.PackageQty, 3); !ok {
		return "", "", "", nil, fail(CodeInvalidQuantity)
	}
	if in.WeightPerPieceG != nil && strings.TrimSpace(*in.WeightPerPieceG) != "" {
		w, _, ok := parseDecimal(*in.WeightPerPieceG, 3)
		if !ok {
			return "", "", "", nil, fail(CodeInvalidQuantity)
		}
		weight = &w
	}
	return
}

// CreateProduct adds a product and its regrind item ("regrind from this product").
func (s *Service) CreateProduct(ctx context.Context, actor string, in ProductInput) (Product, error) {
	name, nameAm, pkg, weight, err := validateProduct(in)
	if err != nil {
		return Product{}, err
	}
	tx, q, err := s.begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	id, err := q.CreateProduct(ctx, db.CreateProductParams{Name: name, NameAm: nameAm, SaleUnit: in.SaleUnit, PackageQty: pkg, WeightPerPieceG: ptrText(weight)})
	if isUnique(err) {
		return Product{}, fail(CodeDuplicateName)
	}
	if err != nil {
		return Product{}, err
	}
	if err := q.CreateRegrindItem(ctx, id); err != nil {
		return Product{}, err
	}
	p, err := s.product(ctx, q, id)
	if err != nil {
		return Product{}, err
	}
	if err := audit(ctx, q, actor, "create", "products", p.ID, nil, p); err != nil {
		return Product{}, err
	}
	return p, tx.Commit(ctx)
}

func (s *Service) UpdateProduct(ctx context.Context, actor, id string, in ProductInput) (Product, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Product{}, err
	}
	name, nameAm, pkg, weight, err := validateProduct(in)
	if err != nil {
		return Product{}, err
	}
	tx, q, err := s.begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	before, err := s.product(ctx, q, uid)
	if err != nil {
		return Product{}, err
	}
	active := before.Active
	if in.Active != nil {
		active = *in.Active
	}
	err = q.UpdateProduct(ctx, db.UpdateProductParams{ID: uid, Name: name, NameAm: nameAm, SaleUnit: in.SaleUnit, PackageQty: pkg, WeightPerPieceG: ptrText(weight), Active: active})
	if isUnique(err) {
		return Product{}, fail(CodeDuplicateName)
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && strings.HasPrefix(pgErr.Message, "unit_locked") {
		return Product{}, fail(CodeUnitLocked)
	}
	if err != nil {
		return Product{}, err
	}
	after, err := s.product(ctx, q, uid)
	if err != nil {
		return Product{}, err
	}
	if string(toJSON(before)) != string(toJSON(after)) {
		if err := audit(ctx, q, actor, "update", "products", id, before, after); err != nil {
			return Product{}, err
		}
	}
	return after, tx.Commit(ctx)
}

// CreateColour adds a colour to a product, with its finished-goods item.
func (s *Service) CreateColour(ctx context.Context, actor, productID string, in ColourInput) (Colour, error) {
	pid, err := parseUUID(productID)
	if err != nil {
		return Colour{}, err
	}
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Colour{}, err
	}
	tx, q, err := s.begin(ctx)
	if err != nil {
		return Colour{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	p, err := s.product(ctx, q, pid)
	if err != nil {
		return Colour{}, err
	}
	vid, err := q.CreateVariant(ctx, db.CreateVariantParams{ProductID: pid, Name: name, NameAm: nameAm})
	if isUnique(err) {
		return Colour{}, fail(CodeDuplicateName)
	}
	if err != nil {
		return Colour{}, err
	}
	if err := q.CreateFinishedItem(ctx, db.CreateFinishedItemParams{Unit: p.SaleUnit, VariantID: vid}); err != nil {
		return Colour{}, err
	}
	c := Colour{ID: uuidString(vid), ProductID: productID, Name: name, NameAm: nameAm, Active: true}
	if err := audit(ctx, q, actor, "create", "colours", c.ID, nil, c); err != nil {
		return Colour{}, err
	}
	return c, tx.Commit(ctx)
}

func (s *Service) UpdateColour(ctx context.Context, actor, id string, in ColourInput) (Colour, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Colour{}, err
	}
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Colour{}, err
	}
	tx, q, err := s.begin(ctx)
	if err != nil {
		return Colour{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	v, err := q.GetVariant(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return Colour{}, fail(CodeNotFound)
	}
	if err != nil {
		return Colour{}, err
	}
	before := Colour{ID: id, ProductID: uuidString(v.ProductID), Name: v.Name, NameAm: v.NameAm, Active: v.Active}
	after := before
	after.Name, after.NameAm = name, nameAm
	if in.Active != nil {
		after.Active = *in.Active
	}
	err = q.UpdateVariant(ctx, db.UpdateVariantParams{ID: uid, Name: name, NameAm: nameAm, Active: after.Active})
	if isUnique(err) {
		return Colour{}, fail(CodeDuplicateName)
	}
	if err != nil {
		return Colour{}, err
	}
	if before != after {
		if err := audit(ctx, q, actor, "update", "colours", id, before, after); err != nil {
			return Colour{}, err
		}
	}
	return after, tx.Commit(ctx)
}
