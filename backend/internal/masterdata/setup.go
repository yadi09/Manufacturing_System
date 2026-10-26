package masterdata

// Machines and areas, moulds and standard cycle times, shifts, reasons, stores, professions and
// employees. All editable and audited; anything history may point to is retired, never deleted.

import (
	"context"
	"errors"
	"math/big"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/yadi09/Manufacturing_System/backend/internal/db"
)

// Codes used only by this part.
const (
	CodeUnknownProduct    = "unknown_product"
	CodeUnknownColour     = "unknown_colour"
	CodeNotAMachine       = "not_a_machine"
	CodeInvalidCycle      = "invalid_cycle_time"
	CodeInvalidCavities   = "invalid_cavities"
	CodeInvalidTime       = "invalid_time"
	CodeUnknownProfession = "unknown_profession"
	CodeUnknownUser       = "unknown_user"
	CodeAccountLinked     = "account_linked"
)

type Workspace struct {
	ID      string  `json:"id"`
	Kind    string  `json:"kind"` // machine, qc or recycling
	Name    string  `json:"name"`
	NameAm  string  `json:"name_am"`
	Runs24h bool    `json:"runs_24h"`
	Active  bool    `json:"active"`
	Setups  []Setup `json:"setups"`
}

type WorkspaceInput struct {
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	NameAm  string `json:"name_am"`
	Runs24h *bool  `json:"runs_24h"`
	Active  *bool  `json:"active"`
}

// Setup is a mould on a machine. StandardCycleS is only the starting value of each day's plan.
type Setup struct {
	MouldID        string        `json:"mould_id"`
	StandardCycleS *string       `json:"standard_cycle_s"` // nil: not set yet
	Active         bool          `json:"active"`
	Colours        []SetupColour `json:"colours"`
}

type SetupColour struct {
	ColourID string `json:"colour_id"`
	CycleS   string `json:"cycle_s"`
}

type SetupInput struct {
	StandardCycleS *string       `json:"standard_cycle_s"`
	Active         *bool         `json:"active"`
	Colours        []SetupColour `json:"colours"`
}

type Mould struct {
	ID        string `json:"id"`
	ProductID string `json:"product_id"`
	Name      string `json:"name"`
	NameAm    string `json:"name_am"`
	Cavities  *int   `json:"cavities"` // nil: not known yet
	Active    bool   `json:"active"`
}

type MouldInput struct {
	ProductID string `json:"product_id"`
	Name      string `json:"name"`
	NameAm    string `json:"name_am"`
	Cavities  *int   `json:"cavities"`
	Active    *bool  `json:"active"`
}

type Shift struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	NameAm    string `json:"name_am"`
	StartTime string `json:"start_time"` // HH:MM, local time
	EndTime   string `json:"end_time"`
	Position  int    `json:"position"`
	Active    bool   `json:"active"`
	// CrossesMidnight: the shift ends the next day; its work belongs to the day it started.
	CrossesMidnight bool `json:"crosses_midnight"`
}

// ShiftInput: changing the times of an existing shift needs a reason (written to the audit log).
type ShiftInput struct {
	Name      string `json:"name"`
	NameAm    string `json:"name_am"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Position  *int   `json:"position"`
	Active    *bool  `json:"active"`
	Reason    string `json:"reason"`
}

type Reason struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"` // damage or downtime
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
	Active bool   `json:"active"`
}

type ReasonInput struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
	Active *bool  `json:"active"`
}

type Location struct {
	Key        string `json:"key"`
	HoldsStock bool   `json:"holds_stock"`
	Name       string `json:"name"`
	NameAm     string `json:"name_am"`
}

type LocationInput struct {
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
}

type Profession struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	NameAm    string `json:"name_am"`
	Active    bool   `json:"active"`
	Employees int    `json:"employees"` // active employees with this profession
}

type ProfessionInput struct {
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
	Active *bool  `json:"active"`
}

type Employee struct {
	ID           string  `json:"id"`
	FullName     string  `json:"full_name"`
	NameAm       *string `json:"name_am"`
	ProfessionID string  `json:"profession_id"`
	UserID       *string `json:"user_id"` // nil: no sign-in account (operators)
	Email        *string `json:"email"`
	Active       bool    `json:"active"`
}

type EmployeeInput struct {
	FullName     string  `json:"full_name"`
	NameAm       *string `json:"name_am"`
	ProfessionID string  `json:"profession_id"`
	UserID       *string `json:"user_id"`
	Active       *bool   `json:"active"`
}

// ---------- shared ----------

// change runs one audited write: load the row, apply the change, load it again, and write an
// audit row when something changed. A duplicate name becomes duplicate_name.
func change[T any](ctx context.Context, s *Service, actor, entity, id, reason string, load func(*db.Queries) (T, error), apply func(*db.Queries, T) error) (T, error) {
	var zero T
	tx, q, err := s.begin(ctx)
	if err != nil {
		return zero, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	before, err := load(q)
	if err != nil {
		return zero, err
	}
	if err := apply(q, before); err != nil {
		if isUnique(err) {
			return zero, fail(CodeDuplicateName)
		}
		return zero, err
	}
	after, err := load(q)
	if err != nil {
		return zero, err
	}
	if string(toJSON(before)) != string(toJSON(after)) {
		if _, err := q.InsertAudit(ctx, db.InsertAuditParams{
			Actor: actor, Action: "update", Entity: entity, EntityID: id, OldValue: toJSON(before), NewValue: toJSON(after),
			Reason: pgtype.Text{String: reason, Valid: reason != ""},
		}); err != nil {
			return zero, err
		}
	}
	return after, tx.Commit(ctx)
}

// create runs one audited insert and returns the new row.
func create[T any](ctx context.Context, s *Service, actor, entity string, insert func(*db.Queries) (pgtype.UUID, error), load func(*db.Queries, pgtype.UUID) (T, error), idOf func(T) string) (T, error) {
	var zero T
	tx, q, err := s.begin(ctx)
	if err != nil {
		return zero, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	id, err := insert(q)
	if isUnique(err) {
		return zero, fail(CodeDuplicateName)
	}
	if err != nil {
		return zero, err
	}
	v, err := load(q, id)
	if err != nil {
		return zero, err
	}
	if err := audit(ctx, q, actor, "create", entity, idOf(v), nil, v); err != nil {
		return zero, err
	}
	return v, tx.Commit(ctx)
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(CodeNotFound)
	}
	return err
}

func or(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func optUUID(s *string) (pgtype.UUID, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return pgtype.UUID{}, nil
	}
	return parseUUID(*s)
}

func uuidPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuidString(u)
	return &s
}

func cycle(s *string) (*string, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	// Above zero, at most 2 decimals and at most an hour.
	v, r, ok := parseDecimal(*s, 2)
	if !ok || r.Cmp(big.NewRat(3600, 1)) > 0 {
		return nil, fail(CodeInvalidCycle)
	}
	return &v, nil
}

// ---------- workspaces and moulds ----------

func isWorkspaceKind(k string) bool { return k == "machine" || k == "qc" || k == "recycling" }

func (s *Service) ListWorkspaces(ctx context.Context) ([]Workspace, error) {
	q := db.New(s.pool)
	rows, err := q.ListWorkspaces(ctx)
	if err != nil {
		return nil, err
	}
	setups, err := s.setupsByWorkspace(ctx, q)
	if err != nil {
		return nil, err
	}
	out := make([]Workspace, 0, len(rows))
	for _, r := range rows {
		w := Workspace{ID: uuidString(r.ID), Kind: r.Kind, Name: r.Name, NameAm: r.NameAm, Runs24h: r.Runs24h, Active: r.Active, Setups: setups[uuidString(r.ID)]}
		if w.Setups == nil {
			w.Setups = []Setup{}
		}
		out = append(out, w)
	}
	return out, nil
}

func (s *Service) setupsByWorkspace(ctx context.Context, q *db.Queries) (map[string][]Setup, error) {
	rows, err := q.ListSetups(ctx)
	if err != nil {
		return nil, err
	}
	cols, err := q.ListSetupColours(ctx)
	if err != nil {
		return nil, err
	}
	byID := map[string][]SetupColour{}
	for _, c := range cols {
		byID[uuidString(c.SetupID)] = append(byID[uuidString(c.SetupID)], SetupColour{ColourID: uuidString(c.VariantID), CycleS: c.CycleS})
	}
	out := map[string][]Setup{}
	for _, r := range rows {
		c := byID[uuidString(r.ID)]
		if c == nil {
			c = []SetupColour{}
		}
		w := uuidString(r.WorkspaceID)
		out[w] = append(out[w], Setup{MouldID: uuidString(r.MouldID), StandardCycleS: nilIfEmpty(r.StandardCycleS), Active: r.Active, Colours: c})
	}
	return out, nil
}

func (s *Service) workspace(ctx context.Context, q *db.Queries, id pgtype.UUID) (Workspace, error) {
	r, err := q.GetWorkspace(ctx, id)
	if err != nil {
		return Workspace{}, notFound(err)
	}
	setups, err := s.setupsByWorkspace(ctx, q)
	if err != nil {
		return Workspace{}, err
	}
	w := Workspace{ID: uuidString(r.ID), Kind: r.Kind, Name: r.Name, NameAm: r.NameAm, Runs24h: r.Runs24h, Active: r.Active, Setups: setups[uuidString(r.ID)]}
	if w.Setups == nil {
		w.Setups = []Setup{}
	}
	return w, nil
}

func (s *Service) CreateWorkspace(ctx context.Context, actor string, in WorkspaceInput) (Workspace, error) {
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Workspace{}, err
	}
	if !isWorkspaceKind(in.Kind) {
		return Workspace{}, fail(CodeInvalidInput)
	}
	return create(ctx, s, actor, "workspaces",
		func(q *db.Queries) (pgtype.UUID, error) {
			return q.CreateWorkspace(ctx, db.CreateWorkspaceParams{Kind: in.Kind, Name: name, NameAm: nameAm, Runs24h: or(in.Runs24h, true)})
		},
		func(q *db.Queries, id pgtype.UUID) (Workspace, error) { return s.workspace(ctx, q, id) },
		func(w Workspace) string { return w.ID })
}

func (s *Service) UpdateWorkspace(ctx context.Context, actor, id string, in WorkspaceInput) (Workspace, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Workspace{}, err
	}
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Workspace{}, err
	}
	return change(ctx, s, actor, "workspaces", id, "",
		func(q *db.Queries) (Workspace, error) { return s.workspace(ctx, q, uid) },
		func(q *db.Queries, b Workspace) error {
			kind := b.Kind
			if in.Kind != "" {
				if !isWorkspaceKind(in.Kind) {
					return fail(CodeInvalidInput)
				}
				kind = in.Kind
			}
			return q.UpdateWorkspace(ctx, db.UpdateWorkspaceParams{ID: uid, Kind: kind, Name: name, NameAm: nameAm, Runs24h: or(in.Runs24h, b.Runs24h), Active: or(in.Active, b.Active)})
		})
}

func mouldFrom(id, product pgtype.UUID, name, nameAm string, cavities int32, active bool) Mould {
	m := Mould{ID: uuidString(id), ProductID: uuidString(product), Name: name, NameAm: nameAm, Active: active}
	if cavities > 0 {
		c := int(cavities)
		m.Cavities = &c
	}
	return m
}

func (s *Service) ListMoulds(ctx context.Context) ([]Mould, error) {
	rows, err := db.New(s.pool).ListMoulds(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Mould, 0, len(rows))
	for _, r := range rows {
		out = append(out, mouldFrom(r.ID, r.ProductID, r.Name, r.NameAm, r.Cavities, r.Active))
	}
	return out, nil
}

func (s *Service) mould(ctx context.Context, q *db.Queries, id pgtype.UUID) (Mould, error) {
	r, err := q.GetMould(ctx, id)
	if err != nil {
		return Mould{}, notFound(err)
	}
	return mouldFrom(r.ID, r.ProductID, r.Name, r.NameAm, r.Cavities, r.Active), nil
}

func cavities(c *int) (pgtype.Int4, error) {
	if c == nil {
		return pgtype.Int4{}, nil
	}
	if *c <= 0 || *c > 1000 {
		return pgtype.Int4{}, fail(CodeInvalidCavities)
	}
	return pgtype.Int4{Int32: int32(*c), Valid: true}, nil
}

func (s *Service) CreateMould(ctx context.Context, actor string, in MouldInput) (Mould, error) {
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Mould{}, err
	}
	cav, err := cavities(in.Cavities)
	if err != nil {
		return Mould{}, err
	}
	pid, err := parseUUID(in.ProductID)
	if err != nil {
		return Mould{}, fail(CodeUnknownProduct)
	}
	return create(ctx, s, actor, "moulds",
		func(q *db.Queries) (pgtype.UUID, error) {
			if _, err := q.GetProduct(ctx, pid); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return pgtype.UUID{}, fail(CodeUnknownProduct)
				}
				return pgtype.UUID{}, err
			}
			return q.CreateMould(ctx, db.CreateMouldParams{ProductID: pid, Name: name, NameAm: nameAm, Cavities: cav})
		},
		func(q *db.Queries, id pgtype.UUID) (Mould, error) { return s.mould(ctx, q, id) },
		func(m Mould) string { return m.ID })
}

// UpdateMould changes names, cavities and active. The product a mould makes never changes.
func (s *Service) UpdateMould(ctx context.Context, actor, id string, in MouldInput) (Mould, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Mould{}, err
	}
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Mould{}, err
	}
	cav, err := cavities(in.Cavities)
	if err != nil {
		return Mould{}, err
	}
	return change(ctx, s, actor, "moulds", id, "",
		func(q *db.Queries) (Mould, error) { return s.mould(ctx, q, uid) },
		func(q *db.Queries, b Mould) error {
			return q.UpdateMould(ctx, db.UpdateMouldParams{ID: uid, Name: name, NameAm: nameAm, Cavities: cav, Active: or(in.Active, b.Active)})
		})
}

// SetMould puts a mould on a machine (or changes it): its standard cycle time and optional
// cycle times per colour of the mould's product. Active false takes it off the machine.
func (s *Service) SetMould(ctx context.Context, actor, workspaceID, mouldID string, in SetupInput) (Workspace, error) {
	wid, err := parseUUID(workspaceID)
	if err != nil {
		return Workspace{}, err
	}
	mid, err := parseUUID(mouldID)
	if err != nil {
		return Workspace{}, err
	}
	std, err := cycle(in.StandardCycleS)
	if err != nil {
		return Workspace{}, err
	}
	seen := map[string]bool{}
	for i, c := range in.Colours {
		v, err := cycle(&c.CycleS)
		if err != nil || v == nil {
			return Workspace{}, fail(CodeInvalidCycle)
		}
		if seen[c.ColourID] {
			return Workspace{}, fail(CodeInvalidInput)
		}
		seen[c.ColourID] = true
		in.Colours[i].CycleS = *v
	}
	return change(ctx, s, actor, "workspaces", workspaceID, "",
		func(q *db.Queries) (Workspace, error) { return s.workspace(ctx, q, wid) },
		func(q *db.Queries, b Workspace) error {
			if b.Kind != "machine" {
				return fail(CodeNotAMachine)
			}
			m, err := s.mould(ctx, q, mid)
			if err != nil {
				return err
			}
			setupID, err := q.UpsertSetup(ctx, db.UpsertSetupParams{WorkspaceID: wid, MouldID: mid, StandardCycleS: ptrText(std), Active: or(in.Active, true)})
			if err != nil {
				return err
			}
			if err := q.DeleteSetupColours(ctx, setupID); err != nil {
				return err
			}
			for _, c := range in.Colours {
				vid, err := parseUUID(c.ColourID)
				if err != nil {
					return fail(CodeUnknownColour)
				}
				v, err := q.GetVariant(ctx, vid)
				if err != nil || uuidString(v.ProductID) != m.ProductID {
					return fail(CodeUnknownColour)
				}
				if err := q.InsertSetupColour(ctx, db.InsertSetupColourParams{SetupID: setupID, VariantID: vid, CycleS: c.CycleS}); err != nil {
					return err
				}
			}
			return nil
		})
}

// ---------- shifts ----------

var clockRE = regexp.MustCompile(`^([01]\d|2[0-3]):([0-5]\d)$`)

func shiftFrom(id pgtype.UUID, name, nameAm, start, end string, pos int32, active bool) Shift {
	return Shift{ID: uuidString(id), Name: name, NameAm: nameAm, StartTime: start, EndTime: end, Position: int(pos), Active: active, CrossesMidnight: end < start}
}

func (s *Service) ListShifts(ctx context.Context) ([]Shift, error) {
	rows, err := db.New(s.pool).ListShifts(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Shift, 0, len(rows))
	for _, r := range rows {
		out = append(out, shiftFrom(r.ID, r.Name, r.NameAm, r.StartTime, r.EndTime, r.Position, r.Active))
	}
	return out, nil
}

func (s *Service) shift(ctx context.Context, q *db.Queries, id pgtype.UUID) (Shift, error) {
	r, err := q.GetShift(ctx, id)
	if err != nil {
		return Shift{}, notFound(err)
	}
	return shiftFrom(r.ID, r.Name, r.NameAm, r.StartTime, r.EndTime, r.Position, r.Active), nil
}

func validShift(in ShiftInput) (name, nameAm string, err error) {
	if name, nameAm, err = names(in.Name, in.NameAm); err != nil {
		return
	}
	if !clockRE.MatchString(in.StartTime) || !clockRE.MatchString(in.EndTime) || in.StartTime == in.EndTime {
		return "", "", fail(CodeInvalidTime)
	}
	if in.Position != nil && (*in.Position <= 0 || *in.Position > 10) {
		return "", "", fail(CodeInvalidInput)
	}
	return
}

func (s *Service) CreateShift(ctx context.Context, actor string, in ShiftInput) (Shift, error) {
	name, nameAm, err := validShift(in)
	if err != nil {
		return Shift{}, err
	}
	pos := 1
	if in.Position != nil {
		pos = *in.Position
	}
	return create(ctx, s, actor, "shifts",
		func(q *db.Queries) (pgtype.UUID, error) {
			return q.CreateShift(ctx, db.CreateShiftParams{Name: name, NameAm: nameAm, StartTime: in.StartTime, EndTime: in.EndTime, Position: int32(pos)})
		},
		func(q *db.Queries, id pgtype.UUID) (Shift, error) { return s.shift(ctx, q, id) },
		func(v Shift) string { return v.ID })
}

// UpdateShift: new times apply to new plans and records; records already made keep the shift they
// point to. A change of times needs a reason, which goes to the audit log.
func (s *Service) UpdateShift(ctx context.Context, actor, id string, in ShiftInput) (Shift, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Shift{}, err
	}
	name, nameAm, err := validShift(in)
	if err != nil {
		return Shift{}, err
	}
	reason := strings.TrimSpace(in.Reason)
	return change(ctx, s, actor, "shifts", id, reason,
		func(q *db.Queries) (Shift, error) { return s.shift(ctx, q, uid) },
		func(q *db.Queries, b Shift) error {
			if (in.StartTime != b.StartTime || in.EndTime != b.EndTime) && reason == "" {
				return fail(CodeReasonRequired)
			}
			pos := b.Position
			if in.Position != nil {
				pos = *in.Position
			}
			return q.UpdateShift(ctx, db.UpdateShiftParams{ID: uid, Name: name, NameAm: nameAm, StartTime: in.StartTime, EndTime: in.EndTime, Position: int32(pos), Active: or(in.Active, b.Active)})
		})
}

// ---------- reasons ----------

func (s *Service) ListReasons(ctx context.Context) ([]Reason, error) {
	rows, err := db.New(s.pool).ListReasons(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Reason, 0, len(rows))
	for _, r := range rows {
		out = append(out, Reason{ID: uuidString(r.ID), Kind: r.Kind, Name: r.Name, NameAm: r.NameAm, Active: r.Active})
	}
	return out, nil
}

func (s *Service) reason(ctx context.Context, q *db.Queries, id pgtype.UUID) (Reason, error) {
	r, err := q.GetReason(ctx, id)
	if err != nil {
		return Reason{}, notFound(err)
	}
	return Reason{ID: uuidString(r.ID), Kind: r.Kind, Name: r.Name, NameAm: r.NameAm, Active: r.Active}, nil
}

func (s *Service) CreateReason(ctx context.Context, actor string, in ReasonInput) (Reason, error) {
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Reason{}, err
	}
	if in.Kind != "damage" && in.Kind != "downtime" {
		return Reason{}, fail(CodeInvalidInput)
	}
	return create(ctx, s, actor, "reasons",
		func(q *db.Queries) (pgtype.UUID, error) {
			return q.CreateReason(ctx, db.CreateReasonParams{Kind: in.Kind, Name: name, NameAm: nameAm})
		},
		func(q *db.Queries, id pgtype.UUID) (Reason, error) { return s.reason(ctx, q, id) },
		func(v Reason) string { return v.ID })
}

// UpdateReason renames or retires a reason. Its kind never changes, so old records keep their meaning.
func (s *Service) UpdateReason(ctx context.Context, actor, id string, in ReasonInput) (Reason, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Reason{}, err
	}
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Reason{}, err
	}
	return change(ctx, s, actor, "reasons", id, "",
		func(q *db.Queries) (Reason, error) { return s.reason(ctx, q, uid) },
		func(q *db.Queries, b Reason) error {
			return q.UpdateReason(ctx, db.UpdateReasonParams{ID: uid, Name: name, NameAm: nameAm, Active: or(in.Active, b.Active)})
		})
}

// ---------- locations (fixed; rename only) ----------

func (s *Service) ListLocations(ctx context.Context) ([]Location, error) {
	rows, err := db.New(s.pool).ListLocations(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Location, 0, len(rows))
	for _, r := range rows {
		out = append(out, Location{Key: r.Key, HoldsStock: r.HoldsStock, Name: r.Name, NameAm: r.NameAm})
	}
	return out, nil
}

func (s *Service) RenameLocation(ctx context.Context, actor, key string, in LocationInput) (Location, error) {
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Location{}, err
	}
	load := func(q *db.Queries) (Location, error) {
		r, err := q.GetLocation(ctx, key)
		if err != nil {
			return Location{}, notFound(err)
		}
		return Location{Key: r.Key, HoldsStock: r.HoldsStock, Name: r.Name, NameAm: r.NameAm}, nil
	}
	return change(ctx, s, actor, "locations", key, "", load, func(q *db.Queries, _ Location) error {
		return q.RenameLocation(ctx, db.RenameLocationParams{Key: key, Name: name, NameAm: nameAm})
	})
}

// ---------- professions ----------

func (s *Service) ListProfessions(ctx context.Context) ([]Profession, error) {
	rows, err := db.New(s.pool).ListProfessions(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Profession, 0, len(rows))
	for _, r := range rows {
		out = append(out, Profession{ID: uuidString(r.ID), Name: r.Name, NameAm: r.NameAm, Active: r.Active, Employees: int(r.Employees)})
	}
	return out, nil
}

func (s *Service) profession(ctx context.Context, q *db.Queries, id pgtype.UUID) (Profession, error) {
	r, err := q.GetProfession(ctx, id)
	if err != nil {
		return Profession{}, notFound(err)
	}
	return Profession{ID: uuidString(r.ID), Name: r.Name, NameAm: r.NameAm, Active: r.Active}, nil
}

func (s *Service) CreateProfession(ctx context.Context, actor string, in ProfessionInput) (Profession, error) {
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Profession{}, err
	}
	return create(ctx, s, actor, "professions",
		func(q *db.Queries) (pgtype.UUID, error) {
			return q.CreateProfession(ctx, db.CreateProfessionParams{Name: name, NameAm: nameAm})
		},
		func(q *db.Queries, id pgtype.UUID) (Profession, error) { return s.profession(ctx, q, id) },
		func(v Profession) string { return v.ID })
}

func (s *Service) UpdateProfession(ctx context.Context, actor, id string, in ProfessionInput) (Profession, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Profession{}, err
	}
	name, nameAm, err := names(in.Name, in.NameAm)
	if err != nil {
		return Profession{}, err
	}
	return change(ctx, s, actor, "professions", id, "",
		func(q *db.Queries) (Profession, error) { return s.profession(ctx, q, uid) },
		func(q *db.Queries, b Profession) error {
			return q.UpdateProfession(ctx, db.UpdateProfessionParams{ID: uid, Name: name, NameAm: nameAm, Active: or(in.Active, b.Active)})
		})
}

// ---------- employees ----------

func employeeFrom(id pgtype.UUID, fullName, nameAm string, prof, user pgtype.UUID, email string, active bool) Employee {
	return Employee{ID: uuidString(id), FullName: fullName, NameAm: nilIfEmpty(nameAm), ProfessionID: uuidString(prof), UserID: uuidPtr(user), Email: nilIfEmpty(email), Active: active}
}

func (s *Service) ListEmployees(ctx context.Context) ([]Employee, error) {
	rows, err := db.New(s.pool).ListEmployees(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Employee, 0, len(rows))
	for _, r := range rows {
		out = append(out, employeeFrom(r.ID, r.FullName, r.NameAm, r.ProfessionID, r.UserID, r.Email, r.Active))
	}
	return out, nil
}

func (s *Service) employee(ctx context.Context, q *db.Queries, id pgtype.UUID) (Employee, error) {
	r, err := q.GetEmployee(ctx, id)
	if err != nil {
		return Employee{}, notFound(err)
	}
	return employeeFrom(r.ID, r.FullName, r.NameAm, r.ProfessionID, r.UserID, r.Email, r.Active), nil
}

type employeeFields struct {
	fullName   string
	nameAm     pgtype.Text
	profession pgtype.UUID
	user       pgtype.UUID
}

// employeeInput checks the fields and that the profession and the account exist. The account is
// optional: operators have none.
func employeeInput(ctx context.Context, q *db.Queries, in EmployeeInput) (employeeFields, error) {
	f := employeeFields{fullName: strings.TrimSpace(in.FullName)}
	if f.fullName == "" || len(f.fullName) > 120 {
		return f, fail(CodeInvalidInput)
	}
	if in.NameAm != nil && strings.TrimSpace(*in.NameAm) != "" {
		am := strings.TrimSpace(*in.NameAm)
		if len(am) > 120 {
			return f, fail(CodeInvalidInput)
		}
		f.nameAm = text(am)
	}
	pid, err := parseUUID(in.ProfessionID)
	if err != nil {
		return f, fail(CodeUnknownProfession)
	}
	if _, err := q.GetProfession(ctx, pid); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return f, fail(CodeUnknownProfession)
		}
		return f, err
	}
	f.profession = pid
	uid, err := optUUID(in.UserID)
	if err != nil {
		return f, fail(CodeUnknownUser)
	}
	if uid.Valid {
		ok, err := q.UserExists(ctx, uid)
		if err != nil {
			return f, err
		}
		if !ok {
			return f, fail(CodeUnknownUser)
		}
	}
	f.user = uid
	return f, nil
}

func (s *Service) CreateEmployee(ctx context.Context, actor string, in EmployeeInput) (Employee, error) {
	v, err := create(ctx, s, actor, "employees",
		func(q *db.Queries) (pgtype.UUID, error) {
			f, err := employeeInput(ctx, q, in)
			if err != nil {
				return pgtype.UUID{}, err
			}
			return q.CreateEmployee(ctx, db.CreateEmployeeParams{FullName: f.fullName, NameAm: f.nameAm, ProfessionID: f.profession, UserID: f.user})
		},
		func(q *db.Queries, id pgtype.UUID) (Employee, error) { return s.employee(ctx, q, id) },
		func(v Employee) string { return v.ID })
	return v, accountTaken(err)
}

func (s *Service) UpdateEmployee(ctx context.Context, actor, id string, in EmployeeInput) (Employee, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Employee{}, err
	}
	v, err := change(ctx, s, actor, "employees", id, "",
		func(q *db.Queries) (Employee, error) { return s.employee(ctx, q, uid) },
		func(q *db.Queries, b Employee) error {
			f, err := employeeInput(ctx, q, in)
			if err != nil {
				return err
			}
			return q.UpdateEmployee(ctx, db.UpdateEmployeeParams{ID: uid, FullName: f.fullName, NameAm: f.nameAm, ProfessionID: f.profession, UserID: f.user, Active: or(in.Active, b.Active)})
		})
	return v, accountTaken(err)
}

// accountTaken: employee names may repeat, so the only unique field is the account link.
func accountTaken(err error) error {
	var e *Error
	if errors.As(err, &e) && e.Code == CodeDuplicateName {
		return fail(CodeAccountLinked)
	}
	return err
}
