-include .env
export

.PHONY: db-up db-down dev test lint migrate

db-up:
	docker compose up -d --wait postgres
	docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='crown_test'" | grep -q 1 || \
		docker compose exec -T postgres psql -U $(POSTGRES_USER) -d postgres -c "CREATE DATABASE crown_test"

db-down:
	docker compose down

dev: db-up migrate
	@echo "Dev targets: backend and frontend are added in the next steps."

test:
	@echo "No tests yet."

lint:
	@echo "No linters yet."

migrate:
	@echo "Migrations are added in step 4b."
