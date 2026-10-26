-- name: GetSetting :one
SELECT key, value, updated_at FROM settings WHERE key = $1;

-- name: UpsertSetting :one
INSERT INTO settings (key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
RETURNING key, value, updated_at;

-- name: InsertAudit :one
INSERT INTO audit_log (actor, action, entity, entity_id, old_value, new_value, reason)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, at;
