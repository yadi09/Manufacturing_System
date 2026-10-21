// Package testdb gives integration tests a clean, fully migrated real PostgreSQL.
//
// The first test in a package builds a template database (every migration applied from scratch).
// Each test then gets its own copy of that template, which takes milliseconds, and the copy is
// dropped afterwards. Tests therefore never share state, and a broken migration still fails them.
package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
)

const templateName = "crown_test_template"

var (
	templateOnce sync.Once
	templateErr  error
	counter      atomic.Int64
)

// withDatabase returns the URL with its database name replaced.
func withDatabase(raw, name string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	u.Path = "/" + name
	return u.String(), nil
}

func buildTemplate(baseURL string) error {
	adminURL, err := withDatabase(baseURL, "postgres")
	if err != nil {
		return err
	}
	admin, err := sql.Open("pgx", adminURL)
	if err != nil {
		return err
	}
	defer admin.Close()
	if _, err := admin.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", templateName)); err != nil {
		return err
	}
	if _, err := admin.Exec(fmt.Sprintf("CREATE DATABASE %s", templateName)); err != nil {
		return err
	}
	tplURL, err := withDatabase(baseURL, templateName)
	if err != nil {
		return err
	}
	tpl, err := sql.Open("pgx", tplURL)
	if err != nil {
		return err
	}
	defer tpl.Close()
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(file), "..", "..", "migrations")
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(tpl, dir)
}

// New returns a pool on a fresh, fully migrated database. It skips the test if no database is
// configured.
func New(t *testing.T) *pgxpool.Pool {
	t.Helper()
	auth.UseCheapHashingInTests()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL not set; run `make test`")
	}
	templateOnce.Do(func() { templateErr = buildTemplate(base) })
	if templateErr != nil {
		t.Fatalf("build template database: %v", templateErr)
	}

	adminURL, err := withDatabase(base, "postgres")
	if err != nil {
		t.Fatal(err)
	}
	admin, err := sql.Open("pgx", adminURL)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("crown_t_%d_%d", os.Getpid(), counter.Add(1))
	if _, err := admin.Exec(fmt.Sprintf("CREATE DATABASE %s TEMPLATE %s", name, templateName)); err != nil {
		admin.Close()
		t.Fatalf("clone template: %v", err)
	}
	testURL, err := withDatabase(base, name)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), testURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", name))
		admin.Close()
	})
	return pool
}
