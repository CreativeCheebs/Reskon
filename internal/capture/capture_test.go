package capture

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var lookups = Lookups{
	EnergyTypes: []string{"Engineering", "Physical", "Admin", "Rest", "Leisure"},
	Subtypes:    map[string][]string{"Engineering": {"coding", "debugging"}, "Leisure": {"gaming", "social"}},
	Areas:       []string{"Main job", "Personal"},
	Candidates: []Candidate{
		{ID: 7, Key: "OM2-114", Title: "stm32 demo board bring-up", EnergyType: "Engineering"},
	},
}

// fakeModel answers like an OpenAI-compatible server, replying with the
// canned JSON for each input line.
func fakeModel(t *testing.T, answers map[string]string, delay time.Duration) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		var req struct {
			Messages []struct{ Role, Content string }
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &req)
		if !strings.Contains(req.Messages[0].Content, "OM2-114: stm32 demo board bring-up") {
			t.Errorf("candidates missing from prompt")
		}
		select {
		case <-time.After(delay):
		case <-r.Context().Done():
			return
		}
		content := answers[req.Messages[1].Content]
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"role": "assistant", "content": content}}},
		})
	}))
}

func parser(url string) *Parser {
	return &Parser{
		Config:   func(context.Context) Config { return Config{Endpoint: url + "/v1", Model: "test"} },
		Provider: OpenAI{},
	}
}

func s(v *string) string {
	if v == nil {
		return "<nil>"
	}
	return *v
}

func TestTheFourExamples(t *testing.T) {
	answers := map[string]string{
		"Worked on stm32 demo, 2 hours":         "```json\n" + `{"intent":"session","kind":"task","title":"stm32 demo","energy_type":"Admin","hours":2,"subtypes":["coding"],"matched_task_key":"OM2-114","confidence":0.9}` + "\n```",
		"Played video games with my cousin":     `{"intent":"session","kind":"event","title":"Played video games with my cousin","energy_type":"Leisure","subtypes":["gaming","social"],"matched_task_key":"OM2-114"}`,
		"Cleaned my devices":                    `{"intent":"session","kind":"task","title":"Cleaned my devices","energy_type":"Admin"}`,
		"Need to order a replacement NVR drive": `{"intent":"task","kind":"task","title":"Order a replacement NVR drive","energy_type":"Admin","area":"personal"}`,
	}
	srv := fakeModel(t, answers, 0)
	defer srv.Close()
	p := parser(srv.URL)
	ctx := context.Background()

	r := p.Parse(ctx, "Worked on stm32 demo, 2 hours", lookups)
	if r.Fallback || s(r.Intent) != "session" || s(r.Kind) != "task" || r.Hours == nil || *r.Hours != 2 {
		t.Errorf("stm32: %+v", r)
	}
	// Matched task's energy type overrides the parsed "Admin".
	if s(r.EnergyType) != "Engineering" || r.MatchedTaskID == nil || *r.MatchedTaskID != 7 {
		t.Errorf("stm32 match: energy=%s id=%v", s(r.EnergyType), r.MatchedTaskID)
	}

	r = p.Parse(ctx, "Played video games with my cousin", lookups)
	if s(r.Intent) != "session" || s(r.Kind) != "event" || s(r.EnergyType) != "Leisure" {
		t.Errorf("gaming: %+v", r)
	}
	if r.MatchedTaskKey != nil {
		t.Errorf("event was attached to a task")
	}
	if len(r.Subtypes) != 2 {
		t.Errorf("gaming subtypes = %v", r.Subtypes)
	}

	r = p.Parse(ctx, "Cleaned my devices", lookups)
	if s(r.Intent) != "session" || s(r.Kind) != "task" || s(r.EnergyType) != "Admin" || r.Hours != nil {
		t.Errorf("cleaned: %+v", r)
	}

	r = p.Parse(ctx, "Need to order a replacement NVR drive", lookups)
	if s(r.Intent) != "task" || s(r.Area) != "Personal" {
		t.Errorf("nvr: %+v", r)
	}
}

func TestTimeoutFallsBack(t *testing.T) {
	srv := fakeModel(t, map[string]string{}, 10*time.Second)
	defer srv.Close()
	start := time.Now()
	r := parser(srv.URL).Parse(context.Background(), "Worked on stm32 demo, 2 hours", lookups)
	took := time.Since(start)
	if !r.Fallback || s(r.Title) != "Worked on stm32 demo, 2 hours" {
		t.Errorf("want fallback with raw title, got %+v", r)
	}
	if took > Timeout+time.Second {
		t.Errorf("fallback took %v", took)
	}
	if !strings.Contains(r.FallbackReason, "5 seconds") {
		t.Errorf("reason = %q", r.FallbackReason)
	}
}

func TestDownOrUnsetFallsBack(t *testing.T) {
	r := parser("http://127.0.0.1:1").Parse(context.Background(), "x", lookups)
	if !r.Fallback {
		t.Error("dead endpoint should fall back")
	}
	p := &Parser{Config: func(context.Context) Config { return Config{} }, Provider: OpenAI{}}
	if r := p.Parse(context.Background(), "x", lookups); !r.Fallback {
		t.Error("unset endpoint should fall back")
	}
	var nilParser *Parser
	if r := nilParser.Parse(context.Background(), "x", lookups); !r.Fallback {
		t.Error("nil parser should fall back")
	}
}

func TestNormaliseRejectsInventions(t *testing.T) {
	str := func(v string) *string { return &v }
	h, d := 30.0, 7
	r := Normalise(Result{
		Intent: str("maybe"), EnergyType: str("Cooking"), Area: str("Mars"),
		Hours: &h, Difficulty: &d, MatchedTaskKey: str("PER-999"), Subtypes: []string{"coding", "flying"},
	}, "raw", lookups)
	if r.Intent != nil || r.EnergyType != nil || r.Area != nil || r.Hours != nil || r.Difficulty != nil || r.MatchedTaskKey != nil {
		t.Errorf("invented values survived: %+v", r)
	}
	if len(r.Subtypes) != 1 || r.Subtypes[0] != "coding" {
		t.Errorf("subtypes = %v", r.Subtypes)
	}
	if s(r.Title) != "raw" {
		t.Errorf("empty title should fall back to raw text")
	}
}

// Some models wrap the contract in another object; the reader unwraps it.
func TestDecodeUnwrapsWrappedReply(t *testing.T) {
	reply := `{"name": "response", "type": "json_object", "value": {"intent": "session", "kind": "event", "title": "Video game - Quantum Break", "energy_type": "Leisure", "hours": 3, "difficulty": 3, "area": "Personal"}}`
	r, err := decodeContent(reply)
	if err != nil {
		t.Fatal(err)
	}
	if r.EnergyType == nil || *r.EnergyType != "Leisure" || r.Hours == nil || *r.Hours != 3 || r.Difficulty == nil || *r.Difficulty != 3 {
		t.Fatalf("wrapped reply decoded as %+v", r)
	}
	if _, err := decodeContent(`{"foo": 1}`); err == nil {
		t.Error("a reply with no contract fields should be an error, so capture falls back")
	}
}

// One line can be several entries; each is checked like a single one, and
// a single-object reply still comes back as one entry.
func TestSeveralEntries(t *testing.T) {
	line := "6 hours at hospital, work was only 1 hour, grandfather diagnosis took the rest"
	answers := map[string]string{
		line: `{"entries":[
			{"intent":"session","kind":"task","title":"Work","energy_type":"Engineering","hours":1,"area":"Main job","matched_task_key":"OM2-114"},
			{"intent":"session","kind":"event","title":"Grandfather's diagnosis","energy_type":"Nonsense","hours":5,"area":"Personal","matched_task_key":"OM2-114"}]}`,
		"Cleaned my devices": `{"intent":"session","kind":"task","title":"Cleaned my devices","energy_type":"Admin"}`,
	}
	srv := fakeModel(t, answers, 0)
	defer srv.Close()
	p := parser(srv.URL)

	r := p.Parse(context.Background(), line, lookups)
	if r.Fallback || len(r.Entries) != 2 {
		t.Fatalf("entries = %d, fallback %v (%s)", len(r.Entries), r.Fallback, r.FallbackReason)
	}
	work, hosp := r.Entries[0], r.Entries[1]
	if s(work.Title) != "Work" || work.Hours == nil || *work.Hours != 1 || work.MatchedTaskID == nil || *work.MatchedTaskID != 7 {
		t.Errorf("work entry: %+v", work)
	}
	if s(hosp.Kind) != "event" || hosp.Hours == nil || *hosp.Hours != 5 || hosp.EnergyType != nil || hosp.MatchedTaskKey != nil {
		t.Errorf("hospital entry: %+v (unknown type and event task match must be dropped)", hosp)
	}
	if s(r.Title) != "Work" || r.Entries[0].Entries != nil {
		t.Errorf("top level should be the first entry, without nesting")
	}

	r = p.Parse(context.Background(), "Cleaned my devices", lookups)
	if len(r.Entries) != 1 || s(r.Entries[0].Title) != "Cleaned my devices" {
		t.Errorf("single reply: %+v", r.Entries)
	}
	if fb := Fallback("x", "off"); len(fb.Entries) != 1 {
		t.Errorf("fallback entries = %d", len(fb.Entries))
	}
}

// Several energy types in one activity: unknown ones are dropped, shares
// are rescaled to whole percents adding up to 100, and the first becomes
// the entry's energy type.
func TestNormaliseEnergies(t *testing.T) {
	three := 3
	r := Normalise(Result{Energies: []EnergyShare{
		{EnergyType: "learning", Share: 60}, {EnergyType: "Nonsense", Share: 20}, {EnergyType: "Leisure", Share: 20, Difficulty: &three},
	}}, "x", Lookups{EnergyTypes: []string{"Learning", "Leisure"}})
	if len(r.Energies) != 2 || r.Energies[0].EnergyType != "Learning" || r.Energies[0].Share != 75 || r.Energies[1].Share != 25 {
		t.Fatalf("energies = %+v", r.Energies)
	}
	if s(r.EnergyType) != "Learning" || r.Energies[1].Difficulty == nil {
		t.Errorf("first part should be the energy type: %s", s(r.EnergyType))
	}
	r = Normalise(Result{Energies: []EnergyShare{{EnergyType: "Leisure", Share: 100}}}, "x", Lookups{EnergyTypes: []string{"Leisure"}})
	if r.Energies != nil {
		t.Errorf("one type should not come back as energies: %+v", r.Energies)
	}
}
