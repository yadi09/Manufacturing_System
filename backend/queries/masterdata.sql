-- ---------- materials (raw materials and additives) ----------

-- name: ListMaterials :many
SELECT i.id, i.kind, i.name, i.name_am, i.unit, COALESCE(i.bag_qty::text, '')::text AS bag_qty, i.active,
       (SELECT count(*) FROM bom_lines bl JOIN boms b ON b.id = bl.bom_id WHERE bl.item_id = i.id AND b.status = 'active') AS used_in
FROM items i WHERE i.kind IN ('raw_material', 'additive') ORDER BY lower(i.name);

-- name: GetMaterial :one
SELECT i.id, i.kind, i.name, i.name_am, i.unit, COALESCE(i.bag_qty::text, '')::text AS bag_qty, i.active
FROM items i WHERE i.id = $1 AND i.kind IN ('raw_material', 'additive');

-- name: CreateMaterial :one
INSERT INTO items (kind, name, name_am, unit, bag_qty) VALUES (@kind, @name, @name_am, @unit, (sqlc.narg('bag_qty')::text)::numeric)
RETURNING id;

-- name: UpdateMaterial :exec
UPDATE items SET name = @name, name_am = @name_am, bag_qty = (sqlc.narg('bag_qty')::text)::numeric, active = @active
WHERE id = @id AND kind IN ('raw_material', 'additive');

-- ---------- products and colours ----------

-- name: ListProducts :many
SELECT id, name, name_am, sale_unit, package_qty::text AS package_qty, COALESCE(weight_per_piece_g::text, '')::text AS weight_per_piece_g, active FROM products ORDER BY lower(name);

-- name: GetProduct :one
SELECT id, name, name_am, sale_unit, package_qty::text AS package_qty, COALESCE(weight_per_piece_g::text, '')::text AS weight_per_piece_g, active FROM products WHERE id = $1;

-- name: CreateProduct :one
INSERT INTO products (name, name_am, sale_unit, package_qty, weight_per_piece_g)
VALUES (@name, @name_am, @sale_unit, (@package_qty::text)::numeric, (sqlc.narg('weight_per_piece_g')::text)::numeric)
RETURNING id;

-- name: UpdateProduct :exec
UPDATE products SET name = @name, name_am = @name_am, sale_unit = @sale_unit, package_qty = (@package_qty::text)::numeric,
    weight_per_piece_g = (sqlc.narg('weight_per_piece_g')::text)::numeric, active = @active
WHERE id = @id;

-- name: ListVariants :many
SELECT v.id, v.product_id, v.name, v.name_am, v.active,
       COALESCE((SELECT b.version FROM boms b WHERE b.variant_id = v.id AND b.status = 'active'), 0)::int AS active_version
FROM variants v ORDER BY v.product_id, lower(v.name);

-- name: GetVariant :one
SELECT v.id, v.product_id, v.name, v.name_am, v.active FROM variants v WHERE v.id = $1;

-- name: CreateVariant :one
INSERT INTO variants (product_id, name, name_am) VALUES ($1, $2, $3) RETURNING id;

-- name: UpdateVariant :exec
UPDATE variants SET name = @name, name_am = @name_am, active = @active WHERE id = @id;

-- name: LockVariant :one
SELECT id, product_id FROM variants WHERE id = $1 FOR UPDATE;

-- name: CreateFinishedItem :exec
INSERT INTO items (kind, unit, variant_id) VALUES ('finished', @unit, @variant_id);

-- name: CreateRegrindItem :exec
INSERT INTO items (kind, unit, source_product_id) VALUES ('regrind', 'kg', @source_product_id);

-- ---------- recipes ----------

-- name: GetActiveBom :one
SELECT id, variant_id, version, status, reason, created_by, created_at, replaced_at, COALESCE(warn_pct::text, '')::text AS warn_pct, COALESCE(crit_pct::text, '')::text AS crit_pct
FROM boms WHERE variant_id = $1 AND status = 'active';

-- name: GetBomVersion :one
SELECT id, variant_id, version, status, reason, created_by, created_at, replaced_at, COALESCE(warn_pct::text, '')::text AS warn_pct, COALESCE(crit_pct::text, '')::text AS crit_pct
FROM boms WHERE variant_id = $1 AND version = $2;

-- name: ListBomVersions :many
SELECT id, variant_id, version, status, reason, created_by, created_at, replaced_at FROM boms WHERE variant_id = $1 ORDER BY version DESC;

-- name: ListBomLines :many
SELECT bl.item_id, i.kind, i.name, i.name_am, bl.qty::text AS qty, bl.unit
FROM bom_lines bl JOIN items i ON i.id = bl.item_id WHERE bl.bom_id = $1 ORDER BY lower(i.name);

-- name: ListBomRules :many
SELECT r.source_product_id, p.name, p.name_am, COALESCE(r.max_blend_pct::text, '')::text AS max_blend_pct
FROM bom_regrind_rules r JOIN products p ON p.id = r.source_product_id WHERE r.bom_id = $1 ORDER BY lower(p.name);

-- name: LatestBomVersion :one
SELECT COALESCE(max(version), 0)::int AS version FROM boms WHERE variant_id = $1;

-- name: MarkBomReplaced :exec
UPDATE boms SET status = 'replaced', replaced_at = now() WHERE variant_id = $1 AND status = 'active';

-- name: InsertBom :one
INSERT INTO boms (variant_id, version, status, reason, created_by, warn_pct, crit_pct)
VALUES (@variant_id, @version, 'active', @reason, @created_by, (sqlc.narg('warn_pct')::text)::numeric, (sqlc.narg('crit_pct')::text)::numeric)
RETURNING id, created_at;

-- name: InsertBomLine :exec
INSERT INTO bom_lines (bom_id, item_id, qty, unit) VALUES (@bom_id, @item_id, (@qty::text)::numeric, @unit);

-- name: InsertBomRule :exec
INSERT INTO bom_regrind_rules (bom_id, source_product_id, max_blend_pct) VALUES (@bom_id, @source_product_id, (sqlc.narg('max_blend_pct')::text)::numeric);

-- name: GetItemForRecipe :one
SELECT i.id, i.kind, i.unit, i.active, u.kind AS unit_kind FROM items i JOIN units u ON u.key = i.unit WHERE i.id = $1;

-- name: GetUnit :one
SELECT key, kind FROM units WHERE key = $1;
