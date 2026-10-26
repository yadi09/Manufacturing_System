-- +goose Up
-- Settings hold business rules (see CLAUDE.md "Settings, not constants").
CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb       NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only audit log: rows are never updated or deleted.
CREATE TABLE audit_log (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at         timestamptz NOT NULL DEFAULT now(),
    actor      text        NOT NULL,
    action     text        NOT NULL,
    entity     text        NOT NULL,
    entity_id  text        NOT NULL,
    old_value  jsonb,
    new_value  jsonb,
    reason     text
);

-- +goose StatementBegin
CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; add a reversing entry instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- +goose Down
DROP TRIGGER audit_log_append_only ON audit_log;
DROP FUNCTION forbid_change();
DROP TABLE audit_log;
DROP TABLE settings;
