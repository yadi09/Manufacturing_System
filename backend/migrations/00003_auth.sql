-- +goose Up
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text        NOT NULL,
    full_name     text        NOT NULL,
    password_hash text        NOT NULL,
    active        boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_lower CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE roles (
    key  text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE role_permissions (
    role_key   text NOT NULL REFERENCES roles (key),
    permission text NOT NULL,
    PRIMARY KEY (role_key, permission)
);

CREATE TABLE user_roles (
    user_id  uuid NOT NULL REFERENCES users (id),
    role_key text NOT NULL REFERENCES roles (key),
    PRIMARY KEY (user_id, role_key)
);

-- Only the hash of the session token is stored.
CREATE TABLE sessions (
    token_hash bytea       PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Starting roles from docs/process.md. Permissions are data and can be edited.
INSERT INTO roles (key, name) VALUES
    ('admin', 'Administrator'),
    ('owner', 'Owner / GM'),
    ('cashier', 'Cashier / sales (finance)'),
    ('production_manager', 'Production manager'),
    ('shift_supervisor', 'Shift production manager / supervisor'),
    ('store_raw', 'Store manager (raw material)'),
    ('store_fg', 'Store manager (finished goods)'),
    ('operator', 'Machine operator'),
    ('qc_inspector', 'QC inspector'),
    ('purchaser', 'Purchaser'),
    ('finance', 'Finance (report user)');

-- Only permissions for features that exist so far. Later milestones add their own.
INSERT INTO role_permissions (role_key, permission) VALUES
    ('admin', 'users.manage'),
    ('admin', 'settings.manage'),
    ('admin', 'audit.read'),
    ('owner', 'audit.read');

-- +goose Down
DROP TABLE sessions;
DROP TABLE user_roles;
DROP TABLE role_permissions;
DROP TABLE roles;
DROP TABLE users;
