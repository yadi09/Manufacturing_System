package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
	"github.com/yadi09/Manufacturing_System/backend/internal/masterdata"
)

// Pinger is satisfied by *pgxpool.Pool.
type Pinger interface {
	Ping(ctx context.Context) error
}

type Deps struct {
	DB   Pinger
	Auth *auth.Service
	// Master is the products, materials and recipes service. Optional so older tests can omit it.
	Master *masterdata.Service
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
		uh := &userHandlers{auth: d.Auth}
		r.Route("/api/auth", func(r chi.Router) {
			r.Post("/login", h.login)
			r.Post("/logout", h.logout)
			r.With(RequireAuthEvenIfPasswordMustChange(d.Auth)).Get("/me", h.me)
			r.With(RequireAuthEvenIfPasswordMustChange(d.Auth)).Post("/password", uh.changeOwnPassword)
			// Display choices are harmless, and a person who must change the password still needs their language.
			r.With(RequireAuthEvenIfPasswordMustChange(d.Auth)).Patch("/preferences", uh.setPreferences)
		})
		r.Route("/api", func(r chi.Router) {
			r.Use(RequireAuth(d.Auth), RequirePermission("users.manage"))
			r.Get("/roles", uh.roles)
			r.Route("/users", func(r chi.Router) {
				r.Get("/", uh.list)
				r.Post("/", uh.create)
				r.Patch("/{id}", uh.update)
				r.Post("/{id}/password", uh.resetPassword)
			})
		})
		if d.Master != nil {
			mh := &masterHandlers{svc: d.Master}
			read := func(h http.HandlerFunc) http.Handler { return RequirePermission("masterdata.read")(h) }
			manage := func(h http.HandlerFunc) http.Handler { return RequirePermission("masterdata.manage")(h) }
			r.Group(func(r chi.Router) {
				r.Use(RequireAuth(d.Auth))
				r.Route("/api/materials", func(r chi.Router) {
					r.Method("GET", "/", read(mh.listMaterials))
					r.Method("POST", "/", manage(mh.createMaterial))
					r.Method("PATCH", "/{id}", manage(mh.updateMaterial))
				})
				r.Route("/api/products", func(r chi.Router) {
					r.Method("GET", "/", read(mh.listProducts))
					r.Method("POST", "/", manage(mh.createProduct))
					r.Method("PATCH", "/{id}", manage(mh.updateProduct))
					r.Method("POST", "/{id}/colours", manage(mh.createColour))
				})
				r.Route("/api/colours/{id}", func(r chi.Router) {
					r.Method("PATCH", "/", manage(mh.updateColour))
					r.Method("GET", "/recipe", read(mh.getRecipe))
					r.Method("GET", "/recipe/versions", read(mh.listVersions))
					r.Method("GET", "/recipe/versions/{n}", read(mh.getVersion))
					r.Method("POST", "/recipe/versions", manage(mh.saveRecipe))
				})
			})
		}
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
