package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
)

const sessionCookie = "session"

type ctxKey struct{}

// CurrentUser returns the signed-in user set by RequireAuth.
func CurrentUser(ctx context.Context) (auth.User, bool) {
	u, ok := ctx.Value(ctxKey{}).(auth.User)
	return u, ok
}

// RequireAuth rejects requests without a valid session.
func RequireAuth(svc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(sessionCookie)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthenticated")
				return
			}
			u, err := svc.Authenticate(r.Context(), c.Value)
			if errors.Is(err, auth.ErrNoSession) {
				writeError(w, http.StatusUnauthorized, "unauthenticated")
				return
			}
			if err != nil {
				writeError(w, http.StatusInternalServerError, "internal")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
		})
	}
}

// RequirePermission rejects signed-in users whose roles do not grant the permission.
// Use after RequireAuth.
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := CurrentUser(r.Context())
			if !ok {
				writeError(w, http.StatusUnauthorized, "unauthenticated")
				return
			}
			if !u.Can(permission) {
				writeError(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type authHandlers struct {
	auth   *auth.Service
	secure bool
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *authHandlers) login(w http.ResponseWriter, r *http.Request) {
	// Requiring JSON blocks cross-site form posts: browsers cannot send it without a CORS preflight.
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	token, user, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	var locked *auth.LockedError
	if errors.As(err, &locked) {
		w.Header().Set("Retry-After", strconv.Itoa(int(locked.RetryAfter.Seconds())+1))
		writeError(w, http.StatusTooManyRequests, "too_many_attempts")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: h.secure,
		SameSite: http.SameSiteLaxMode, Expires: time.Now().Add(auth.SessionLifetime),
	})
	writeJSON(w, http.StatusOK, user)
}

func (h *authHandlers) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = h.auth.Logout(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: h.secure,
		SameSite: http.SameSiteLaxMode, MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

func (h *authHandlers) me(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r.Context())
	writeJSON(w, http.StatusOK, u)
}
