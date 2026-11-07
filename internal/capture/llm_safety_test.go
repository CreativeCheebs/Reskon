package capture

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The endpoint is whatever a user typed. The server must not follow it to
// somewhere else, and must not read its answers back to that user.
func TestOpenAIDoesNotFollowRedirects(t *testing.T) {
	reached := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true }))
	defer target.Close()
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer redirector.Close()

	_, err := OpenAI{}.Complete(context.Background(), Config{Endpoint: redirector.URL, Model: "m", APIKey: "k"}, "hello", Lookups{})
	if err == nil {
		t.Fatal("want an error for a redirect")
	}
	if reached {
		t.Fatal("the redirect target was contacted")
	}
}

func TestOpenAIErrorDoesNotQuoteTheEndpointsAnswer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("internal-admin-page-secret"))
	}))
	defer srv.Close()
	_, err := OpenAI{}.Complete(context.Background(), Config{Endpoint: srv.URL, Model: "m"}, "hello", Lookups{})
	if err == nil || strings.Contains(err.Error(), "internal-admin-page-secret") {
		t.Fatalf("error must not quote the body: %v", err)
	}
	if !strings.Contains(err.Error(), "500") {
		t.Fatalf("error should still say the status: %v", err)
	}
}
