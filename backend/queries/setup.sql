-- ---------- workspaces (machines and areas) ----------

-- name: ListWorkspaces :many
SELECT id, kind, name, name_am, runs_24h, active FROM workspaces ORDER BY kind = 'machine' DESC, lower(name);

-- name: GetWorkspace :one
SELECT id, kind, name, name_am, runs_24h, active FROM workspaces WHERE id = $1;

-- name: CreateWorkspace :one
INSERT INTO workspaces (kind, name, name_am, runs_24h) VALUES (@kind, @name, @name_am, @runs_24h) RETURNING id;

-- name: UpdateWorkspace :exec
UPDATE workspaces SET kind = @kind, name = @name, name_am = @name_am, runs_24h = @runs_24h, active = @active WHERE id = @id;

-- ---------- moulds and setups ----------

-- name: ListMoulds :many
SELECT m.id, m.product_id, m.name, m.name_am, COALESCE(m.cavities, 0)::int AS cavities, m.active FROM moulds m ORDER BY lower(m.name);

-- name: GetMould :one
SELECT m.id, m.product_id, m.name, m.name_am, COALESCE(m.cavities, 0)::int AS cavities, m.active FROM moulds m WHERE m.id = $1;

-- name: CreateMould :one
INSERT INTO moulds (product_id, name, name_am, cavities) VALUES (@product_id, @name, @name_am, sqlc.narg('cavities')::int) RETURNING id;

-- name: UpdateMould :exec
UPDATE moulds SET name = @name, name_am = @name_am, cavities = sqlc.narg('cavities')::int, active = @active WHERE id = @id;

-- name: ListSetups :many
SELECT s.id, s.workspace_id, s.mould_id, COALESCE(s.standard_cycle_s::text, '')::text AS standard_cycle_s, s.active
FROM mould_setups s JOIN moulds m ON m.id = s.mould_id ORDER BY lower(m.name);

-- name: GetSetup :one
SELECT id, workspace_id, mould_id, COALESCE(standard_cycle_s::text, '')::text AS standard_cycle_s, active
FROM mould_setups WHERE workspace_id = $1 AND mould_id = $2;

-- name: UpsertSetup :one
INSERT INTO mould_setups (workspace_id, mould_id, standard_cycle_s, active)
VALUES (@workspace_id, @mould_id, (sqlc.narg('standard_cycle_s')::text)::numeric, @active)
ON CONFLICT (workspace_id, mould_id) DO UPDATE SET standard_cycle_s = EXCLUDED.standard_cycle_s, active = EXCLUDED.active
RETURNING id;

-- name: ListSetupColours :many
SELECT sc.setup_id, sc.variant_id, sc.cycle_s::text AS cycle_s FROM mould_setup_colours sc
JOIN variants v ON v.id = sc.variant_id ORDER BY lower(v.name);

-- name: DeleteSetupColours :exec
DELETE FROM mould_setup_colours WHERE setup_id = $1;

-- name: InsertSetupColour :exec
INSERT INTO mould_setup_colours (setup_id, variant_id, cycle_s) VALUES (@setup_id, @variant_id, (@cycle_s::text)::numeric);

-- ---------- shifts ----------

-- name: ListShifts :many
SELECT id, name, name_am, to_char(start_time, 'HH24:MI')::text AS start_time, to_char(end_time, 'HH24:MI')::text AS end_time, position, active
FROM shifts ORDER BY active DESC, position, lower(name);

-- name: GetShift :one
SELECT id, name, name_am, to_char(start_time, 'HH24:MI')::text AS start_time, to_char(end_time, 'HH24:MI')::text AS end_time, position, active
FROM shifts WHERE id = $1;

-- name: CreateShift :one
INSERT INTO shifts (name, name_am, start_time, end_time, position)
VALUES (@name, @name_am, (@start_time::text)::time, (@end_time::text)::time, @position) RETURNING id;

-- name: UpdateShift :exec
UPDATE shifts SET name = @name, name_am = @name_am, start_time = (@start_time::text)::time, end_time = (@end_time::text)::time,
    position = @position, active = @active WHERE id = @id;

-- ---------- reasons ----------

-- name: ListReasons :many
SELECT id, kind, name, name_am, active FROM reasons ORDER BY kind, active DESC, lower(name);

-- name: GetReason :one
SELECT id, kind, name, name_am, active FROM reasons WHERE id = $1;

-- name: CreateReason :one
INSERT INTO reasons (kind, name, name_am) VALUES (@kind, @name, @name_am) RETURNING id;

-- name: UpdateReason :exec
UPDATE reasons SET name = @name, name_am = @name_am, active = @active WHERE id = @id;

-- ---------- locations ----------

-- name: ListLocations :many
SELECT key, holds_stock, position, name, name_am FROM locations ORDER BY position;

-- name: GetLocation :one
SELECT key, holds_stock, position, name, name_am FROM locations WHERE key = $1;

-- name: RenameLocation :exec
UPDATE locations SET name = @name, name_am = @name_am WHERE key = @key;

-- ---------- professions and employees ----------

-- name: ListProfessions :many
SELECT p.id, p.name, p.name_am, p.active, (SELECT count(*) FROM employees e WHERE e.profession_id = p.id AND e.active) AS employees
FROM professions p ORDER BY p.active DESC, lower(p.name);

-- name: GetProfession :one
SELECT id, name, name_am, active FROM professions WHERE id = $1;

-- name: CreateProfession :one
INSERT INTO professions (name, name_am) VALUES (@name, @name_am) RETURNING id;

-- name: UpdateProfession :exec
UPDATE professions SET name = @name, name_am = @name_am, active = @active WHERE id = @id;

-- name: ListEmployees :many
SELECT e.id, e.full_name, COALESCE(e.name_am, '')::text AS name_am, e.profession_id, e.user_id, COALESCE(u.email, '')::text AS email, e.active
FROM employees e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.active DESC, lower(e.full_name);

-- name: GetEmployee :one
SELECT e.id, e.full_name, COALESCE(e.name_am, '')::text AS name_am, e.profession_id, e.user_id, COALESCE(u.email, '')::text AS email, e.active
FROM employees e LEFT JOIN users u ON u.id = e.user_id WHERE e.id = $1;

-- name: CreateEmployee :one
INSERT INTO employees (full_name, name_am, profession_id, user_id) VALUES (@full_name, sqlc.narg('name_am'), @profession_id, sqlc.narg('user_id')) RETURNING id;

-- name: UpdateEmployee :exec
UPDATE employees SET full_name = @full_name, name_am = sqlc.narg('name_am'), profession_id = @profession_id, user_id = sqlc.narg('user_id'), active = @active
WHERE id = @id;

-- name: UserExists :one
SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)::bool;
