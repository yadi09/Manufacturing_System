// Package masterdata holds what Crown makes and with what: products, colours, materials and
// recipes (BOMs) with their regrind rules. See docs/master-data-model.md.
package masterdata

import "time"

// Error is a rule the caller broke. Code is a stable string the frontend translates.
type Error struct{ Code string }

func (e *Error) Error() string { return "masterdata: " + e.Code }

func fail(code string) error { return &Error{Code: code} }

// Codes. HTTP statuses are chosen in the httpapi package.
const (
	CodeNotFound        = "not_found"
	CodeNoRecipe        = "no_recipe"
	CodeDuplicateName   = "duplicate_name"
	CodeUnitLocked      = "unit_locked"
	CodeVersionConflict = "version_conflict"
	CodeReasonRequired  = "reason_required"
	CodeInvalidInput    = "invalid_input"
	CodeNoIngredients   = "no_ingredients"
	CodeDuplicateLine   = "duplicate_ingredient"
	CodeInvalidQuantity = "invalid_quantity"
	CodeInvalidBlend    = "invalid_blend"
	CodeInvalidTol      = "invalid_tolerance"
	CodeUnknownItem     = "unknown_item"
	CodeUnitNotAllowed  = "unit_not_allowed"
	CodeDuplicateRule   = "duplicate_regrind_source"
	CodeUnknownSource   = "unknown_regrind_source"
)

type Material struct {
	ID     string  `json:"id"`
	Kind   string  `json:"kind"` // raw_material or additive
	Name   string  `json:"name"`
	NameAm string  `json:"name_am"`
	Unit   string  `json:"unit"`
	BagQty *string `json:"bag_qty"`
	Active bool    `json:"active"`
	UsedIn int     `json:"used_in"` // active recipes that use it
}

type MaterialInput struct {
	Kind   string  `json:"kind"`
	Name   string  `json:"name"`
	NameAm string  `json:"name_am"`
	Unit   string  `json:"unit"`
	BagQty *string `json:"bag_qty"`
	Active *bool   `json:"active"`
}

type Colour struct {
	ID            string `json:"id"`
	ProductID     string `json:"product_id"`
	Name          string `json:"name"`
	NameAm        string `json:"name_am"`
	Active        bool   `json:"active"`
	ActiveVersion *int   `json:"active_version"` // nil: no recipe yet
}

type Product struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	NameAm          string   `json:"name_am"`
	SaleUnit        string   `json:"sale_unit"`
	PackageQty      string   `json:"package_qty"`
	WeightPerPieceG *string  `json:"weight_per_piece_g"`
	Active          bool     `json:"active"`
	Colours         []Colour `json:"colours"`
}

type ProductInput struct {
	Name            string  `json:"name"`
	NameAm          string  `json:"name_am"`
	SaleUnit        string  `json:"sale_unit"`
	PackageQty      string  `json:"package_qty"`
	WeightPerPieceG *string `json:"weight_per_piece_g"`
	Active          *bool   `json:"active"`
}

type ColourInput struct {
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
	Active *bool  `json:"active"`
}

type Line struct {
	ItemID string `json:"item_id"`
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	NameAm string `json:"name_am"`
	Qty    string `json:"qty"`  // per ONE sale unit of the product
	Unit   string `json:"unit"` // g or kg
}

type Rule struct {
	SourceProductID string  `json:"source_product_id"`
	Name            string  `json:"name"`
	NameAm          string  `json:"name_am"`
	MaxBlendPct     *string `json:"max_blend_pct"` // nil: no maximum
}

type Recipe struct {
	ColourID   string     `json:"colour_id"`
	Version    int        `json:"version"`
	Status     string     `json:"status"` // active or replaced
	Reason     string     `json:"reason"`
	CreatedBy  string     `json:"created_by"`
	CreatedAt  time.Time  `json:"created_at"`
	ReplacedAt *time.Time `json:"replaced_at"`
	SaleUnit   string     `json:"sale_unit"`
	Lines      []Line     `json:"lines"`
	Regrind    []Rule     `json:"regrind"`
	// WarnPct and CritPct are this recipe's own tolerances; nil means the settings default applies.
	WarnPct          *string `json:"warn_pct"`
	CritPct          *string `json:"crit_pct"`
	EffectiveWarnPct string  `json:"effective_warn_pct"`
	EffectiveCritPct string  `json:"effective_crit_pct"`
}

type VersionSummary struct {
	Version    int        `json:"version"`
	Status     string     `json:"status"`
	Reason     string     `json:"reason"`
	CreatedBy  string     `json:"created_by"`
	CreatedAt  time.Time  `json:"created_at"`
	ReplacedAt *time.Time `json:"replaced_at"`
}

type LineInput struct {
	ItemID string `json:"item_id"`
	Qty    string `json:"qty"`
	Unit   string `json:"unit"`
}

type RuleInput struct {
	SourceProductID string  `json:"source_product_id"`
	MaxBlendPct     *string `json:"max_blend_pct"`
}

// NewRecipe creates the next version. BaseVersion is the version the editor started from (0 for
// the first recipe); if someone saved in the meantime the save is refused, nothing is overwritten.
type NewRecipe struct {
	BaseVersion int         `json:"base_version"`
	Reason      string      `json:"reason"`
	Lines       []LineInput `json:"lines"`
	Regrind     []RuleInput `json:"regrind"`
	WarnPct     *string     `json:"warn_pct"`
	CritPct     *string     `json:"crit_pct"`
}
