-- +goose Up
INSERT INTO settings (key, value) VALUES
    ('login_max_attempts', '5'),
    ('login_lockout_minutes', '15');

-- Lockout looks at recent failed logins per email.
CREATE INDEX audit_log_actor_at_idx ON audit_log (actor, at DESC);

-- +goose Down
DROP INDEX audit_log_actor_at_idx;
DELETE FROM settings WHERE key IN ('login_max_attempts', 'login_lockout_minutes');
