-include .env
export

.PHONY: db-up db-down dev test lint migrate sqlc screenshots calendar-vectors create-user

db-up:
	docker compose up -d --wait postgres
	docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='crown_test'" | grep -q 1 || \
		docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE crown_test"

db-down:
	docker compose down

dev: db-up migrate
	trap 'kill 0' EXIT; (cd backend && go run ./cmd/api) & (cd frontend && pnpm dev --host) & wait

test: db-up
	cd backend && go test -p 1 ./...  # one package at a time: they share crown_test
	cd frontend && pnpm test

lint:
	cd backend && go vet ./... && test -z "$$(gofmt -l .)"
	cd frontend && pnpm lint

screenshots:
	cd frontend && pnpm screenshots

calendar-vectors:
	node scripts/calendar-vectors.mjs > docs/calendar-vectors.json

migrate:
	cd backend && go tool goose -dir migrations postgres "$(DATABASE_URL)" up

sqlc:
	cd backend && sqlc generate

# make create-user EMAIL=admin@crown.example NAME="Admin" ROLES=admin   (asks for the password)
create-user:
	cd backend && go run ./cmd/createuser -email "$(EMAIL)" -name "$(NAME)" -roles "$(ROLES)"
