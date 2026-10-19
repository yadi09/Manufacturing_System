-- +goose Up
INSERT INTO settings (key, value) VALUES ('display_time_zone', '"Africa/Addis_Ababa"');

-- +goose Down
DELETE FROM settings WHERE key = 'display_time_zone';
