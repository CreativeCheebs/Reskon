package api

import (
	"bytes"
	"encoding/json"
	"io"
	"strconv"
	"testing"
)

// The phone shows a first download as a percentage of X-Sync-Size, so it
// must be the size of the answer before compression.
func TestSyncSizeHeader(t *testing.T) {
	srv := newServer(t)
	c := newClient(t, srv)
	if code := c.do("POST", "/api/auth/setup", m{"username": "alice", "password": "long enough password"}, nil); code != 200 {
		t.Fatalf("setup = %d", code)
	}
	b, _ := json.Marshal(m{"device": "phone", "token": 0, "changes": []any{}})
	// Go's client asks for gzip and unpacks it, as Android's does.
	res, err := c.h.Post(srv.URL+"/api/sync", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 {
		t.Fatalf("sync = %d %s", res.StatusCode, body)
	}
	if !res.Uncompressed {
		t.Errorf("answer was not compressed")
	}
	if size, _ := strconv.Atoi(res.Header.Get("X-Sync-Size")); size != len(body) {
		t.Errorf("X-Sync-Size = %q, body is %d bytes", res.Header.Get("X-Sync-Size"), len(body))
	}
	var out struct {
		Changes []any `json:"changes"`
	}
	if json.Unmarshal(body, &out) != nil || len(out.Changes) == 0 {
		t.Errorf("a first sync should get a full copy, got %d rows", len(out.Changes))
	}
}
