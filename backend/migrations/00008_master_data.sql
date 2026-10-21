-- +goose Up
-- Master data (milestone 2): units, products, colours, items, recipes (BOMs) and regrind rules.
-- See docs/master-data-model.md.

CREATE TABLE units (
    key     text PRIMARY KEY,
    kind    text NOT NULL CHECK (kind IN ('count', 'mass')),
    name    text NOT NULL,
    name_am text NOT NULL
);
INSERT INTO units (key, kind, name, name_am) VALUES
    ('piece', 'count', 'Piece', 'ቁራጭ'),
    ('kg', 'mass', 'Kilogram', 'ኪሎግራም'),
    ('g', 'mass', 'Gram', 'ግራም');

CREATE TABLE products (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text           NOT NULL,
    name_am            text           NOT NULL,
    sale_unit          text           NOT NULL REFERENCES units (key),
    package_qty        numeric(12, 3) NOT NULL CHECK (package_qty > 0),
    weight_per_piece_g numeric(10, 3) CHECK (weight_per_piece_g > 0),
    active             boolean        NOT NULL DEFAULT true,
    created_at         timestamptz    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_name_key ON products (lower(name));

-- A colour of a product. Orders, stock and recipes are per colour.
CREATE TABLE variants (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid        NOT NULL REFERENCES products (id),
    name       text        NOT NULL,
    name_am    text        NOT NULL,
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX variants_name_key ON variants (product_id, lower(name));

-- Anything that has stock. Raw materials and additives are entered by hand; the finished-goods
-- item of each colour and the regrind item of each product are created automatically.
CREATE TABLE items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              text           NOT NULL CHECK (kind IN ('raw_material', 'additive', 'finished', 'regrind')),
    name              text,
    name_am           text,
    unit              text           NOT NULL REFERENCES units (key),
    bag_qty           numeric(12, 3) CHECK (bag_qty > 0),
    variant_id        uuid UNIQUE REFERENCES variants (id),
    source_product_id uuid UNIQUE REFERENCES products (id),
    active            boolean        NOT NULL DEFAULT true,
    created_at        timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT items_kind_shape CHECK (
        (kind IN ('raw_material', 'additive') AND name IS NOT NULL AND name_am IS NOT NULL AND variant_id IS NULL AND source_product_id IS NULL)
        OR (kind = 'finished' AND variant_id IS NOT NULL AND source_product_id IS NULL)
        OR (kind = 'regrind' AND source_product_id IS NOT NULL AND variant_id IS NULL)
    )
);
CREATE UNIQUE INDEX items_material_name_key ON items (lower(name)) WHERE kind IN ('raw_material', 'additive');

-- A recipe version for one colour. Append-only: a change is a new version with a reason.
CREATE TABLE boms (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id  uuid           NOT NULL REFERENCES variants (id),
    version     integer        NOT NULL CHECK (version > 0),
    status      text           NOT NULL CHECK (status IN ('active', 'replaced')),
    reason      text           NOT NULL CHECK (btrim(reason) <> ''),
    created_by  text           NOT NULL,
    created_at  timestamptz    NOT NULL DEFAULT now(),
    replaced_at timestamptz,
    -- NULL means "use the settings default" (bom_warn_pct, bom_crit_pct).
    warn_pct    numeric(5, 2) CHECK (warn_pct > 0 AND warn_pct <= 100),
    crit_pct    numeric(5, 2) CHECK (crit_pct > 0 AND crit_pct <= 100),
    UNIQUE (variant_id, version),
    CHECK ((status = 'replaced') = (replaced_at IS NOT NULL))
);
CREATE UNIQUE INDEX boms_one_active_per_colour ON boms (variant_id) WHERE status = 'active';

-- Quantity of an item per ONE sale unit of the product (for example 42 g per piece, 1 kg per kg).
CREATE TABLE bom_lines (
    bom_id  uuid           NOT NULL REFERENCES boms (id),
    item_id uuid           NOT NULL REFERENCES items (id),
    qty     numeric(14, 6) NOT NULL CHECK (qty > 0),
    unit    text           NOT NULL REFERENCES units (key),
    PRIMARY KEY (bom_id, item_id)
);

-- Regrind this recipe may use. No row for a source product means that regrind is NOT allowed.
CREATE TABLE bom_regrind_rules (
    bom_id            uuid NOT NULL REFERENCES boms (id),
    source_product_id uuid NOT NULL REFERENCES products (id),
    max_blend_pct     numeric(5, 2) CHECK (max_blend_pct > 0 AND max_blend_pct <= 100),
    PRIMARY KEY (bom_id, source_product_id)
);

-- Lines and rules never change. A recipe row may only move from active to replaced.
CREATE TRIGGER bom_lines_append_only BEFORE UPDATE OR DELETE ON bom_lines FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER bom_regrind_rules_append_only BEFORE UPDATE OR DELETE ON bom_regrind_rules FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- +goose StatementBegin
CREATE FUNCTION boms_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'boms is append-only; add a new version instead';
    END IF;
    IF OLD.status = 'active' AND NEW.status = 'replaced' AND NEW.replaced_at IS NOT NULL
       AND (NEW.id, NEW.variant_id, NEW.version, NEW.reason, NEW.created_by, NEW.created_at, NEW.warn_pct, NEW.crit_pct)
           IS NOT DISTINCT FROM (OLD.id, OLD.variant_id, OLD.version, OLD.reason, OLD.created_by, OLD.created_at, OLD.warn_pct, OLD.crit_pct) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'boms is append-only; add a new version instead';
END;
$$ LANGUAGE plpgsql;

-- The sale unit decides how every quantity is counted, so it is fixed once a recipe exists.
CREATE FUNCTION products_unit_lock() RETURNS trigger AS $$
BEGIN
    IF NEW.sale_unit <> OLD.sale_unit AND EXISTS (SELECT 1 FROM boms b JOIN variants v ON v.id = b.variant_id WHERE v.product_id = OLD.id) THEN
        RAISE EXCEPTION 'unit_locked: the sale unit cannot change once a recipe exists';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER boms_append_only BEFORE UPDATE OR DELETE ON boms FOR EACH ROW EXECUTE FUNCTION boms_guard();
CREATE TRIGGER products_unit_lock BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION products_unit_lock();

INSERT INTO settings (key, value) VALUES ('bom_warn_pct', '5'), ('bom_crit_pct', '10');

-- masterdata.manage: administrators define products, colours, materials and recipes (process.md).
-- masterdata.read: the roles that need to see them. Cashier is left out until sales (milestone 6).
INSERT INTO role_permissions (role_key, permission) VALUES
    ('admin', 'masterdata.manage'),
    ('admin', 'masterdata.read'),
    ('owner', 'masterdata.read'),
    ('production_manager', 'masterdata.read'),
    ('shift_supervisor', 'masterdata.read'),
    ('store_raw', 'masterdata.read'),
    ('store_fg', 'masterdata.read'),
    ('purchaser', 'masterdata.read'),
    ('qc_inspector', 'masterdata.read'),
    ('finance', 'masterdata.read');

-- +goose Down
DELETE FROM role_permissions WHERE permission IN ('masterdata.manage', 'masterdata.read');
DELETE FROM settings WHERE key IN ('bom_warn_pct', 'bom_crit_pct');
DROP TRIGGER products_unit_lock ON products;
DROP TRIGGER boms_append_only ON boms;
DROP FUNCTION products_unit_lock();
DROP FUNCTION boms_guard();
DROP TABLE bom_regrind_rules;
DROP TABLE bom_lines;
DROP TABLE boms;
DROP TABLE items;
DROP TABLE variants;
DROP TABLE products;
DROP TABLE units;
