-- +goose Up
-- Each person's display choices, saved on the server so they follow the person to any device.
-- NULL means "not chosen yet": the app then keeps the device's value (the fallback before sign-in).
ALTER TABLE users
    ADD COLUMN language text CHECK (language IN ('en', 'am')),
    ADD COLUMN calendar text CHECK (calendar IN ('ethiopian', 'gregorian'));

-- +goose Down
ALTER TABLE users DROP COLUMN language, DROP COLUMN calendar;
