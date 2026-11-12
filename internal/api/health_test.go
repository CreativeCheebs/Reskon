package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitterbug/internal/version"
)

// The health check needs no sign-in and says which Reskon is running, for the
// sign-in page and for the phone's Settings.
func TestHealthSaysTheVersionWithoutSigningIn(t *testing.T) {
	srv := newServer(t)
	res, err := http.Get(srv.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("status %d", res.StatusCode)
	}
	var got struct {
		OK      bool   `json:"ok"`
		Version string `json:"version"`
	}
	if err := json.NewDecoder(res.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if !got.OK || got.Version != version.Version {
		t.Errorf("health = %+v, want ok and version %s", got, version.Version)
	}
}
