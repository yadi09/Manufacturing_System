-include .env
export

.PHONY: db-up db-down dev test lint migrate sqlc

db-up:
	docker compose up -d --wait postgres
	docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='crown_test'" | grep -q 1 || \
		docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE crown_test"

db-down:
	docker compose down

dev: db-up migrate
	cd backend && go run ./cmd/api

test: db-up
	cd backend && go test ./...

lint:
	cd backend && go vet ./... && test -z "$$(gofmt -l .)"

migrate:
	cd backend && go run github.com/pressly/goose/v3/cmd/goose -dir migrations postgres "$(DATABASE_URL)" up

sqlc:
	cd backend && sqlc generate
