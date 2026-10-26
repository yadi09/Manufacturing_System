package httpapi

import (
	"encoding/json"
	"errors"
	"mime"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
)

type userHandlers struct{ auth *auth.Service }

// decodeJSON requires a JSON body (blocks cross-site form posts) and limits its size.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type")
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return false
	}
	return true
}

// writeAuthError maps service errors to stable codes the frontend translates.
func writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrUserNotFound):
		writeError(w, http.StatusNotFound, "user_not_found")
	case errors.Is(err, auth.ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken")
	case errors.Is(err, auth.ErrWeakPassword):
		writeError(w, http.StatusUnprocessableEntity, "weak_password")
	case errors.Is(err, auth.ErrInvalidEmail):
		writeError(w, http.StatusUnprocessableEntity, "invalid_email")
	case errors.Is(err, auth.ErrUnknownRole):
		writeError(w, http.StatusUnprocessableEntity, "unknown_role")
	case errors.Is(err, auth.ErrLastAdmin):
		writeError(w, http.StatusConflict, "last_admin")
	case errors.Is(err, auth.ErrPasswordUnchanged):
		writeError(w, http.StatusUnprocessableEntity, "password_unchanged")
	case errors.Is(err, auth.ErrWrongPassword):
		writeError(w, http.StatusForbidden, "wrong_password")
	default:
		writeError(w, http.StatusInternalServerError, "internal")
	}
}

func (h *userHandlers) list(w http.ResponseWriter, r *http.Request) {
	users, err := h.auth.ListUsers(r.Context())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *userHandlers) roles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.auth.ListRoles(r.Context())
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roles)
}

type createUserRequest struct {
	Email    string   `json:"email"`
	FullName string   `json:"full_name"`
	Password string   `json:"password"`
	Roles    []string `json:"roles"`
}

func (h *userHandlers) create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	actor, _ := CurrentUser(r.Context())
	u, err := h.auth.CreateUser(r.Context(), actor.Email, req.Email, req.FullName, req.Password, req.Roles, true)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (h *userHandlers) update(w http.ResponseWriter, r *http.Request) {
	var req auth.UserUpdate
	if !decodeJSON(w, r, &req) {
		return
	}
	actor, _ := CurrentUser(r.Context())
	if err := h.auth.UpdateUser(r.Context(), actor.Email, chi.URLParam(r, "id"), req); err != nil {
		writeAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type passwordRequest struct {
	Password string `json:"password"`
}

func (h *userHandlers) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req passwordRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	actor, _ := CurrentUser(r.Context())
	if err := h.auth.ResetPassword(r.Context(), actor.Email, chi.URLParam(r, "id"), req.Password); err != nil {
		writeAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type changePasswordRequest struct {
	Current string `json:"current_password"`
	New     string `json:"new_password"`
}

func (h *userHandlers) changeOwnPassword(w http.ResponseWriter, r *http.Request) {
	var req changePasswordRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	u, _ := CurrentUser(r.Context())
	c, _ := r.Cookie(sessionCookie)
	if err := h.auth.ChangePassword(r.Context(), u.ID, c.Value, req.Current, req.New); err != nil {
		writeAuthError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
