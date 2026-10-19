package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
)

// Pinger is satisfied by *pgxpool.Pool.
type Pinger interface {
	Ping(ctx context.Context) error
}

type Deps struct {
	DB   Pinger
	Auth *auth.Service
	// SecureCookie marks the session cookie HTTPS-only. Turn on in production.
	SecureCookie bool
}

type health struct {
	Status   string `json:"status"`
	Database string `json:"database"`
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		h, code := health{Status: "ok", Database: "up"}, http.StatusOK
		if err := d.DB.Ping(ctx); err != nil {
			h, code = health{Status: "degraded", Database: "down"}, http.StatusServiceUnavailable
		}
		writeJSON(w, code, h)
	})
	if d.Auth != nil {
		h := &authHandlers{auth: d.Auth, secure: d.SecureCookie}
		r.Route("/api/auth", func(r chi.Router) {
			r.Post("/login", h.login)
			r.Post("/logout", h.logout)
			r.With(RequireAuth(d.Auth)).Get("/me", h.me)
		})
	}
	return r
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// apiError is the one error shape; the message is a stable code, never user-facing text,
// so the frontend can translate it.
type apiError struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, code int, key string) {
	writeJSON(w, code, apiError{Error: key})
}
