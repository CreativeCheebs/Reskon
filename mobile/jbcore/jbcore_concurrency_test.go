package jbcore

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Capture can wait up to five seconds for the language model. While it
// waits, every other screen's request must still be answered at once.
func TestASlowCaptureDoesNotBlockOtherCalls(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(Stop)
	if err := Start(dir, "UTC", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	release := make(chan struct{})
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-time.After(10 * time.Second):
		}
	}))
	defer slow.Close()
	defer close(release)
	if _, err := Call("PUT", "/api/settings/llm_endpoint", `"`+slow.URL+`"`); err != nil {
		t.Fatal(err)
	}
	if _, err := Call("PUT", "/api/settings/llm_model", `"m"`); err != nil {
		t.Fatal(err)
	}

	go func() { _, _ = Call("POST", "/api/capture", `{"text":"write the report"}`) }()
	time.Sleep(300 * time.Millisecond) // let the capture reach the slow model

	start := time.Now()
	if _, err := Call("GET", "/api/bootstrap", ""); err != nil {
		t.Fatal(err)
	}
	if took := time.Since(start); took > time.Second {
		t.Fatalf("a screen load waited %v behind the capture", took)
	}
}

// A second Start (the app being recreated) keeps the first one's data and does not reset it.
func TestStartTwiceKeepsTheFirstSession(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(Stop) // registered after TempDir, so it runs first and releases the files
	if err := Start(dir, "UTC", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	first := Cookie()
	if err := Start(dir, "UTC", "me", "a-long-password", ""); err != nil {
		t.Fatal(err)
	}
	if Cookie() != first {
		t.Fatal("a second Start replaced the sign-in")
	}
}

func TestACallBeforeStartIsAnErrorNotAPanic(t *testing.T) {
	Stop()
	if _, err := Call("GET", "/api/bootstrap", ""); err == nil {
		t.Fatal("want an error before Start")
	}
}
