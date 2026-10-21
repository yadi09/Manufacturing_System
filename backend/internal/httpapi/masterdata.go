package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/yadi09/Manufacturing_System/backend/internal/masterdata"
)

type masterHandlers struct{ svc *masterdata.Service }

func writeMasterError(w http.ResponseWriter, err error) {
	var e *masterdata.Error
	if !errors.As(err, &e) {
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	status := http.StatusUnprocessableEntity
	switch e.Code {
	case masterdata.CodeNotFound, masterdata.CodeNoRecipe:
		status = http.StatusNotFound
	case masterdata.CodeDuplicateName, masterdata.CodeUnitLocked, masterdata.CodeVersionConflict:
		status = http.StatusConflict
	}
	writeError(w, status, e.Code)
}

func actorEmail(r *http.Request) string {
	u, _ := CurrentUser(r.Context())
	return u.Email
}

func reply[T any](w http.ResponseWriter, status int, v T, err error) {
	if err != nil {
		writeMasterError(w, err)
		return
	}
	writeJSON(w, status, v)
}

func (h *masterHandlers) listMaterials(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListMaterials(r.Context())
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) createMaterial(w http.ResponseWriter, r *http.Request) {
	var in masterdata.MaterialInput
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.CreateMaterial(r.Context(), actorEmail(r), in)
	reply(w, http.StatusCreated, v, err)
}

func (h *masterHandlers) updateMaterial(w http.ResponseWriter, r *http.Request) {
	var in masterdata.MaterialInput
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.UpdateMaterial(r.Context(), actorEmail(r), chi.URLParam(r, "id"), in)
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) listProducts(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListProducts(r.Context())
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) createProduct(w http.ResponseWriter, r *http.Request) {
	var in masterdata.ProductInput
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.CreateProduct(r.Context(), actorEmail(r), in)
	reply(w, http.StatusCreated, v, err)
}

func (h *masterHandlers) updateProduct(w http.ResponseWriter, r *http.Request) {
	var in masterdata.ProductInput
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.UpdateProduct(r.Context(), actorEmail(r), chi.URLParam(r, "id"), in)
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) createColour(w http.ResponseWriter, r *http.Request) {
	var in masterdata.ColourInput
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.CreateColour(r.Context(), actorEmail(r), chi.URLParam(r, "id"), in)
	reply(w, http.StatusCreated, v, err)
}

func (h *masterHandlers) updateColour(w http.ResponseWriter, r *http.Request) {
	var in masterdata.ColourInput
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.UpdateColour(r.Context(), actorEmail(r), chi.URLParam(r, "id"), in)
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) getRecipe(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.GetRecipe(r.Context(), chi.URLParam(r, "id"))
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) listVersions(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListRecipeVersions(r.Context(), chi.URLParam(r, "id"))
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) getVersion(w http.ResponseWriter, r *http.Request) {
	n, err := strconv.Atoi(chi.URLParam(r, "n"))
	if err != nil {
		writeError(w, http.StatusNotFound, masterdata.CodeNotFound)
		return
	}
	v, err := h.svc.GetRecipeVersion(r.Context(), chi.URLParam(r, "id"), n)
	reply(w, http.StatusOK, v, err)
}

func (h *masterHandlers) saveRecipe(w http.ResponseWriter, r *http.Request) {
	var in masterdata.NewRecipe
	if !decodeJSON(w, r, &in) {
		return
	}
	v, err := h.svc.SaveRecipe(r.Context(), actorEmail(r), chi.URLParam(r, "id"), in)
	reply(w, http.StatusCreated, v, err)
}
