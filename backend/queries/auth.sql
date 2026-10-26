-- name: CreateUser :one
INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3)
RETURNING id, email, full_name, active, created_at;

-- name: GetUserByEmail :one
SELECT id, email, full_name, password_hash, active FROM users WHERE email = $1;

-- name: AssignRole :exec
INSERT INTO user_roles (user_id, role_key) VALUES ($1, $2) ON CONFLICT DO NOTHING;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3);

-- name: GetSessionUser :one
SELECT u.id, u.email, u.full_name, u.active
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > now();

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: ListUserRoles :many
SELECT r.key, r.name FROM user_roles ur JOIN roles r ON r.key = ur.role_key
WHERE ur.user_id = $1 ORDER BY r.key;

-- name: ListUserPermissions :many
SELECT DISTINCT rp.permission FROM user_roles ur
JOIN role_permissions rp ON rp.role_key = ur.role_key
WHERE ur.user_id = $1 ORDER BY rp.permission;

-- name: RecentFailedLogins :many
-- Failed logins for this email inside the window and after the last successful login, newest first.
SELECT f.at FROM audit_log f
WHERE f.entity = 'auth' AND f.action = 'login_failed' AND f.actor = @email::text
  AND f.at > now() - make_interval(secs => @window_secs::int)
  AND f.at > COALESCE((SELECT max(ok.at) FROM audit_log ok WHERE ok.entity = 'auth' AND ok.action = 'login' AND ok.actor = @email::text), '-infinity')
ORDER BY f.at DESC
LIMIT @max_rows::int;
