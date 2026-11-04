package api

import (
	"encoding/json"
	"io"
	"net/http"

	"jitterbug/internal/db"
)

// Sync (Change 003). POST /api/sync is the sync server's side: a device
// sends its changes and gets back everything it hasn't seen. The other
// two run on a device's built-in core, which has no network of its own:
// the app asks for the request, carries it to the server, and hands the
// answer back.

// syncLimit allows a full copy of years of data in one body.
const syncLimit = 64 << 20

type syncRequest struct {
	Device  string       `json:"device"`
	Token   int64        `json:"token"`
	Changes []db.SyncRow `json:"changes"`
}

type syncResponse struct {
	Token   int64        `json:"token"`
	Changes []db.SyncRow `json:"changes"`
}

func (s *Server) syncRoutes() {
	s.mux.HandleFunc("POST /api/sync", s.sync)
	s.mux.HandleFunc("POST /api/sync/outgoing", s.syncOutgoing)
	s.mux.HandleFunc("POST /api/sync/incoming", s.syncIncoming)
}

func decodeLarge(r *http.Request, dst any) error {
	if err := json.NewDecoder(io.LimitReader(r.Body, syncLimit)).Decode(dst); err != nil {
		return &db.InvalidError{Msg: "bad JSON body: " + err.Error()}
	}
	return nil
}

func (s *Server) sync(w http.ResponseWriter, r *http.Request) {
	var req syncRequest
	if err := decodeLarge(r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	if req.Device == "" {
		respond(w, nil, &db.InvalidError{Msg: "device is required"})
		return
	}
	d := dbOf(r.Context())
	if err := d.StartSync(r.Context()); err != nil {
		respond(w, nil, err)
		return
	}
	if err := d.ApplySync(r.Context(), req.Changes, true); err != nil {
		respond(w, nil, err)
		return
	}
	// A device that has seen nothing gets a full copy (item 19); otherwise
	// what changed since its token, less what it sent itself.
	rows, seq, err := d.ExportSync(r.Context(), req.Token, "", req.Device, req.Token == 0)
	if rows == nil {
		rows = []db.SyncRow{}
	}
	respond(w, syncResponse{Token: seq, Changes: rows}, err)
}

// syncOutgoing gives the request a device sends: its own changes since the
// last sync, or everything on its first. upto goes back with the answer.
func (s *Server) syncOutgoing(w http.ResponseWriter, r *http.Request) {
	d := dbOf(r.Context())
	if err := d.StartSync(r.Context()); err != nil {
		respond(w, nil, err)
		return
	}
	device, token, pushed, _ := d.SyncState(r.Context())
	rows, upto, err := d.ExportSync(r.Context(), pushed, device, "", pushed == 0)
	if rows == nil {
		rows = []db.SyncRow{}
	}
	respond(w, map[string]any{
		"request": syncRequest{Device: device, Token: token, Changes: rows},
		"upto":    upto,
	}, err)
}

// syncIncoming applies the server's answer and records how far both sides got.
func (s *Server) syncIncoming(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Response syncResponse `json:"response"`
		Upto     int64        `json:"upto"`
	}
	if err := decodeLarge(r, &body); err != nil {
		respond(w, nil, err)
		return
	}
	d := dbOf(r.Context())
	if err := d.ApplySync(r.Context(), body.Response.Changes, false); err != nil {
		respond(w, nil, err)
		return
	}
	err := d.SetSyncProgress(r.Context(), body.Response.Token, body.Upto)
	respond(w, map[string]int{"received": len(body.Response.Changes)}, err)
}
