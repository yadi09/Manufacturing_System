-- +goose Up
-- Machine operators have no accounts (the shift production manager enters their data), so
-- "operator" is not a sign-in role. It stays a job title on the employee record (milestone 7).
-- If anyone still holds the role this fails on purpose, rather than silently stripping it.
DELETE FROM role_permissions WHERE role_key = 'operator';
DELETE FROM roles WHERE key = 'operator';

-- +goose Down
INSERT INTO roles (key, name, name_am, description, description_am) VALUES
    ('operator', 'Machine operator', 'የማሽን ኦፕሬተር', 'Logs material loaded, machine on and off, output and downtime.', 'የተጫነ ዕቃ፣ ማሽን ማብራት እና ማጥፋት፣ ምርት እና የሥራ መቋረጥን ይመዘግባል።');
