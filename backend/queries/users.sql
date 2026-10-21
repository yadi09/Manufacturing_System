-- name: GetUserByID :one
SELECT id, email, full_name, password_hash, active, must_change_password FROM users WHERE id = $1;

-- name: ListUsers :many
SELECT id, email, full_name, active, must_change_password, created_at FROM users ORDER BY email;

-- name: ListAllUserRoles :many
SELECT user_id, role_key FROM user_roles ORDER BY role_key;

-- name: UpdateUserProfile :exec
UPDATE users SET full_name = $2, active = $3 WHERE id = $1;

-- name: DeleteUserRoles :exec
DELETE FROM user_roles WHERE user_id = $1;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = $1;

-- name: DeleteOtherUserSessions :exec
DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2;

-- name: CountActiveUserManagers :one
SELECT count(DISTINCT u.id) FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN role_permissions rp ON rp.role_key = ur.role_key
WHERE u.active AND rp.permission = 'users.manage';

-- name: ListRolesWithPermissions :many
SELECT r.key, r.name, r.name_am, r.description, r.description_am, COALESCE(array_agg(rp.permission ORDER BY rp.permission) FILTER (WHERE rp.permission IS NOT NULL), '{}')::text[] AS permissions
FROM roles r LEFT JOIN role_permissions rp ON rp.role_key = r.key
GROUP BY r.key ORDER BY r.key;

-- name: GetUserPreferences :one
SELECT language, calendar FROM users WHERE id = $1;

-- name: UpdateUserPreferences :exec
UPDATE users SET language = COALESCE(sqlc.narg('language'), language), calendar = COALESCE(sqlc.narg('calendar'), calendar) WHERE id = @id;
