package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
	"github.com/yadi09/Manufacturing_System/backend/internal/config"
	"github.com/yadi09/Manufacturing_System/backend/internal/httpapi"
	"github.com/yadi09/Manufacturing_System/backend/internal/masterdata"
	"github.com/yadi09/Manufacturing_System/backend/internal/settings"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	srv := &http.Server{Addr: cfg.Addr, Handler: httpapi.NewRouter(httpapi.Deps{DB: pool, Auth: auth.NewService(pool), Master: masterdata.New(pool), Settings: settings.New(pool), SecureCookie: cfg.SecureCookie}), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()
	slog.Info("api listening", "addr", cfg.Addr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}
	return nil
}
