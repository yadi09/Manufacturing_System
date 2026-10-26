-- +goose Up
-- The rest of the master data (milestone 2): machines and areas, moulds and their standard cycle
-- times, shifts, damage and downtime reasons, stores, professions and employees.
-- See docs/master-data-model.md. All of these are editable and audited; anything history may point
-- to is retired (active = false), never deleted.

-- A place where work happens. Crown: Machine 1, Machine 2, the QC area, the recycling workspace.
CREATE TABLE workspaces (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind       text        NOT NULL CHECK (kind IN ('machine', 'qc', 'recycling')),
    name       text        NOT NULL,
    name_am    text        NOT NULL,
    runs_24h   boolean     NOT NULL DEFAULT true,
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workspaces_name_key ON workspaces (lower(name));

-- A mould makes one product. Cavities may be unknown while Crown's data is still coming.
CREATE TABLE moulds (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid        NOT NULL REFERENCES products (id),
    name       text        NOT NULL,
    name_am    text        NOT NULL,
    cavities   integer CHECK (cavities > 0 AND cavities <= 1000),
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX moulds_name_key ON moulds (lower(name));

-- A mould on a machine, with its STANDARD cycle time: only the starting value of each day's plan,
-- which keeps its own copy. Taking a mould off a machine sets active = false.
CREATE TABLE mould_setups (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     uuid          NOT NULL REFERENCES workspaces (id),
    mould_id         uuid          NOT NULL REFERENCES moulds (id),
    standard_cycle_s numeric(7, 2) CHECK (standard_cycle_s > 0),
    active           boolean       NOT NULL DEFAULT true,
    UNIQUE (workspace_id, mould_id)
);

-- An optional standard cycle time for one colour on a setup (Crown: Blue runs faster).
CREATE TABLE mould_setup_colours (
    setup_id   uuid          NOT NULL REFERENCES mould_setups (id),
    variant_id uuid          NOT NULL REFERENCES variants (id),
    cycle_s    numeric(7, 2) NOT NULL CHECK (cycle_s > 0),
    PRIMARY KEY (setup_id, variant_id)
);

-- Shift definitions in local time. A shift whose end is before its start crosses midnight and
-- belongs to the day it started. Past records point to the shift, so times may change safely.
CREATE TABLE shifts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    name_am    text        NOT NULL,
    start_time time        NOT NULL,
    end_time   time        NOT NULL CHECK (end_time <> start_time),
    position   integer     NOT NULL CHECK (position > 0),
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shifts_name_key ON shifts (lower(name));

-- One list of reasons with a kind tag; the screen shows the kinds as tabs.
CREATE TABLE reasons (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind       text        NOT NULL CHECK (kind IN ('damage', 'downtime')),
    name       text        NOT NULL,
    name_am    text        NOT NULL,
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reasons_name_key ON reasons (kind, lower(name));

-- The five places stock and output move between. Fixed, because the stock rules depend on each
-- one's key; only the names can change.
CREATE TABLE locations (
    key         text PRIMARY KEY CHECK (key IN ('raw_store', 'regrind_store', 'qc_area', 'staging_area', 'fg_store')),
    holds_stock boolean NOT NULL,
    position    integer NOT NULL UNIQUE,
    name        text    NOT NULL CHECK (btrim(name) <> ''),
    name_am     text    NOT NULL CHECK (btrim(name_am) <> '')
);
INSERT INTO locations (key, holds_stock, position, name, name_am) VALUES
    ('raw_store', true, 1, 'Raw material store', 'የጥሬ ዕቃ መጋዘን'),
    ('regrind_store', true, 2, 'Regrind store', 'የሚፈጭ መጋዘን'),
    ('qc_area', false, 3, 'QC area', 'የጥራት ቁጥጥር ቦታ'),
    ('staging_area', false, 4, 'Staging area', 'የማቆያ ቦታ'),
    ('fg_store', true, 5, 'Finished goods store', 'የተጠናቀቁ ዕቃዎች መጋዘን');

-- +goose StatementBegin
CREATE FUNCTION locations_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.key, NEW.holds_stock, NEW.position) IS NOT DISTINCT FROM (OLD.key, OLD.holds_stock, OLD.position) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'locations are fixed; only their names can change';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER locations_fixed BEFORE INSERT OR UPDATE OR DELETE ON locations FOR EACH ROW EXECUTE FUNCTION locations_guard();

CREATE TABLE professions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    name_am    text        NOT NULL,
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX professions_name_key ON professions (lower(name));

-- A person who works at Crown. Operators have no user account; the link is optional so that HR
-- can later give someone an account without losing their history.
CREATE TABLE employees (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     text        NOT NULL CHECK (btrim(full_name) <> ''),
    name_am       text,
    profession_id uuid        NOT NULL REFERENCES professions (id),
    user_id       uuid UNIQUE REFERENCES users (id),
    active        boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES ('rest_rotation_minutes', '60');

-- The settings screen uses settings.manage, which administrators already hold (00003_auth.sql).

-- +goose Down
DELETE FROM settings WHERE key = 'rest_rotation_minutes';
DROP TABLE employees;
DROP TABLE professions;
DROP TRIGGER locations_fixed ON locations;
DROP FUNCTION locations_guard();
DROP TABLE locations;
DROP TABLE reasons;
DROP TABLE shifts;
DROP TABLE mould_setup_colours;
DROP TABLE mould_setups;
DROP TABLE moulds;
DROP TABLE workspaces;
