package main

import "testing"

func lookup(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

// A user may point capture at their own model, but then the server-wide key
// must not go with it: that would hand the operator's key to any host a
// signed-in user types in.
func TestCaptureConfigServerKeyStaysWithServerEndpoint(t *testing.T) {
	env := lookup(map[string]string{
		"JITTERBUG_LLM_ENDPOINT": "http://llm.lan:1234/v1",
		"JITTERBUG_LLM_MODEL":    "server-model",
		"JITTERBUG_LLM_API_KEY":  "server-secret",
	})
	cases := []struct {
		name     string
		settings map[string]string
		wantKey  string
		wantEnd  string
	}{
		{"nothing set: server's own", nil, "server-secret", "http://llm.lan:1234/v1"},
		{"same endpoint typed again", map[string]string{"llm_endpoint": "http://llm.lan:1234/v1/"}, "server-secret", "http://llm.lan:1234/v1/"},
		{"another host: no server key", map[string]string{"llm_endpoint": "http://evil.example/v1"}, "", "http://evil.example/v1"},
		{"another host with their own key", map[string]string{"llm_endpoint": "http://mine.example/v1", "llm_api_key": "mine"}, "mine", "http://mine.example/v1"},
		{"own key, server endpoint", map[string]string{"llm_api_key": "mine"}, "mine", "http://llm.lan:1234/v1"},
	}
	for _, c := range cases {
		got := mergeCaptureConfig(lookup(c.settings), env)
		if got.APIKey != c.wantKey || got.Endpoint != c.wantEnd {
			t.Errorf("%s: key=%q endpoint=%q, want key=%q endpoint=%q", c.name, got.APIKey, got.Endpoint, c.wantKey, c.wantEnd)
		}
	}
}
