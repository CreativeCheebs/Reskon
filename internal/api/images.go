package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"time"

	"jitterbug/internal/db"
)

func (s *Server) imageRoutes() {
	s.mux.HandleFunc("POST /api/images", s.uploadImage)
	s.mux.HandleFunc("GET /api/images/{id}", s.getImage)
}

// uploadImage takes the raw file as the body. The type is sniffed from the
// bytes, not taken from the request.
func (s *Server) uploadImage(w http.ResponseWriter, r *http.Request) {
	data, err := io.ReadAll(io.LimitReader(r.Body, db.MaxImageBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad body", err.Error())
		return
	}
	img, err := dbOf(r.Context()).CreateImage(r.Context(), http.DetectContentType(data), data)
	respond(w, img, err)
}

// getImage is private to its owner. Image ids repeat across people, so the
// browser must revalidate (with the session cookie) rather than reuse a copy
// cached for whoever was signed in before.
func (s *Server) getImage(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	img, err := dbOf(r.Context()).GetImage(r.Context(), id)
	if err != nil {
		respond(w, nil, err)
		return
	}
	sum := sha256.Sum256(img.Data)
	w.Header().Set("Content-Type", img.Mime)
	w.Header().Set("ETag", `"`+hex.EncodeToString(sum[:8])+`"`)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Answers If-None-Match with 304, so a revalidation costs no transfer.
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(img.Data))
}
