package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/yadi09/Manufacturing_System/backend/internal/masterdata"
	"github.com/yadi09/Manufacturing_System/backend/internal/settings"
)

// Handlers for machines and areas, moulds, shifts, reasons, stores, professions, employees and
// the settings screen.

func list[T any](fn func(r *http.Request) (T, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		v, err := fn(r)
		reply(w, http.StatusOK, v, err)
	}
}

// write decodes the body into In and calls fn with the URL parameters already read.
func write[In, Out any](status int, fn func(r *http.Request, in In) (Out, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in In
		if !decodeJSON(w, r, &in) {
			return
		}
		v, err := fn(r, in)
		reply(w, status, v, err)
	}
}

func (h *masterHandlers) setupRoutes(r chi.Router, read, manage func(http.HandlerFunc) http.Handler) {
	s := h.svc
	id := func(r *http.Request) string { return chi.URLParam(r, "id") }
	r.Route("/api/workspaces", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Workspace, error) { return s.ListWorkspaces(r.Context()) })))
		r.Method("POST", "/", manage(write(http.StatusCreated, func(r *http.Request, in masterdata.WorkspaceInput) (masterdata.Workspace, error) {
			return s.CreateWorkspace(r.Context(), actorEmail(r), in)
		})))
		r.Method("PATCH", "/{id}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.WorkspaceInput) (masterdata.Workspace, error) {
			return s.UpdateWorkspace(r.Context(), actorEmail(r), id(r), in)
		})))
		r.Method("PUT", "/{id}/moulds/{mould}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.SetupInput) (masterdata.Workspace, error) {
			return s.SetMould(r.Context(), actorEmail(r), id(r), chi.URLParam(r, "mould"), in)
		})))
	})
	r.Route("/api/moulds", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Mould, error) { return s.ListMoulds(r.Context()) })))
		r.Method("POST", "/", manage(write(http.StatusCreated, func(r *http.Request, in masterdata.MouldInput) (masterdata.Mould, error) {
			return s.CreateMould(r.Context(), actorEmail(r), in)
		})))
		r.Method("PATCH", "/{id}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.MouldInput) (masterdata.Mould, error) {
			return s.UpdateMould(r.Context(), actorEmail(r), id(r), in)
		})))
	})
	r.Route("/api/shifts", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Shift, error) { return s.ListShifts(r.Context()) })))
		r.Method("POST", "/", manage(write(http.StatusCreated, func(r *http.Request, in masterdata.ShiftInput) (masterdata.Shift, error) {
			return s.CreateShift(r.Context(), actorEmail(r), in)
		})))
		r.Method("PATCH", "/{id}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.ShiftInput) (masterdata.Shift, error) {
			return s.UpdateShift(r.Context(), actorEmail(r), id(r), in)
		})))
	})
	r.Route("/api/reasons", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Reason, error) { return s.ListReasons(r.Context()) })))
		r.Method("POST", "/", manage(write(http.StatusCreated, func(r *http.Request, in masterdata.ReasonInput) (masterdata.Reason, error) {
			return s.CreateReason(r.Context(), actorEmail(r), in)
		})))
		r.Method("PATCH", "/{id}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.ReasonInput) (masterdata.Reason, error) {
			return s.UpdateReason(r.Context(), actorEmail(r), id(r), in)
		})))
	})
	r.Route("/api/locations", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Location, error) { return s.ListLocations(r.Context()) })))
		r.Method("PATCH", "/{key}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.LocationInput) (masterdata.Location, error) {
			return s.RenameLocation(r.Context(), actorEmail(r), chi.URLParam(r, "key"), in)
		})))
	})
	r.Route("/api/professions", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Profession, error) { return s.ListProfessions(r.Context()) })))
		r.Method("POST", "/", manage(write(http.StatusCreated, func(r *http.Request, in masterdata.ProfessionInput) (masterdata.Profession, error) {
			return s.CreateProfession(r.Context(), actorEmail(r), in)
		})))
		r.Method("PATCH", "/{id}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.ProfessionInput) (masterdata.Profession, error) {
			return s.UpdateProfession(r.Context(), actorEmail(r), id(r), in)
		})))
	})
	r.Route("/api/employees", func(r chi.Router) {
		r.Method("GET", "/", read(list(func(r *http.Request) ([]masterdata.Employee, error) { return s.ListEmployees(r.Context()) })))
		r.Method("POST", "/", manage(write(http.StatusCreated, func(r *http.Request, in masterdata.EmployeeInput) (masterdata.Employee, error) {
			return s.CreateEmployee(r.Context(), actorEmail(r), in)
		})))
		r.Method("PATCH", "/{id}", manage(write(http.StatusOK, func(r *http.Request, in masterdata.EmployeeInput) (masterdata.Employee, error) {
			return s.UpdateEmployee(r.Context(), actorEmail(r), id(r), in)
		})))
	})
}

type settingsHandlers struct{ store *settings.Store }

func (h *settingsHandlers) get(w http.ResponseWriter, r *http.Request) {
	v, err := h.store.Editable(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *settingsHandlers) update(w http.ResponseWriter, r *http.Request) {
	var in map[string]json.RawMessage
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.store.Update(r.Context(), actorEmail(r), in)
	var bad *settings.InvalidError
	if errors.As(err, &bad) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": bad.Code, "key": bad.Key})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusOK, v)
}
