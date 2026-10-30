// Package capture turns one typed or dictated line into a filled form for
// a task or a session. It never writes anything: the caller shows the form,
// the user confirms, and only then is a row created.
//
// Capture must never fail because a model is unavailable. Parse always
// returns a usable Result; when the provider is unset, down, slow or wrong,
// the Result is the manual fallback with the raw text as the title.
package capture

import (
	"context"
	"strings"
)

// Result is the section 8 contract. Any field may be nil; nil fields are
// left blank in the form, never guessed.
type Result struct {
	Intent         *string  `json:"intent"` // "session" | "task"
	Kind           *string  `json:"kind"`   // "task" | "event"
	Title          *string  `json:"title"`
	EnergyType     *string  `json:"energy_type"`
	Hours          *float64 `json:"hours"`
	Difficulty     *int     `json:"difficulty"`
	Subtypes       []string `json:"subtypes"`
	Area           *string  `json:"area"`
	MatchedTaskKey *string  `json:"matched_task_key"`
	Confidence     *float64 `json:"confidence"`

	// Energies, when one activity involves several energy types at once:
	// each with its share (percent, adding up to 100) and intensity. The
	// first is also EnergyType. Nil for one type.
	Energies []EnergyShare `json:"energies"`

	// Entries is every entry in the line, the first being the fields
	// above. One line can hold several ("6 hours at the hospital, work was
	// only 1 of them"). Always at least one in a parsed Result; empty on the
	// entries themselves.
	Entries []Result `json:"entries,omitempty"`

	// Not part of the model's contract; filled in by the server.
	MatchedTaskID  *int64 `json:"matched_task_id"`
	Fallback       bool   `json:"fallback"`        // true when the model was not used
	FallbackReason string `json:"fallback_reason"` // why, for the form to show quietly
}

// EnergyShare is one energy type of an entry with several.
type EnergyShare struct {
	EnergyType string `json:"energy_type"`
	Share      int    `json:"share"`      // percent; an entry's shares add up to 100
	Difficulty *int   `json:"difficulty"` // intensity 1-5, nil if not said
}

// Candidate is an open task the model may match against. Matching happens
// in SQLite; the model only picks among these.
type Candidate struct {
	ID           int64
	Key          string
	Title        string
	EnergyType   string // name of the task's energy type, "" if none
	EnergyTypeID *int64
}

// Lookups is what the model is allowed to answer with.
type Lookups struct {
	EnergyTypes []string            // names
	Subtypes    map[string][]string // energy type name -> subtype names
	Areas       []string            // names
	Candidates  []Candidate
}

// Config is the provider configuration, read fresh on every call so a
// settings change takes effect without a restart.
type Config struct {
	Endpoint string // OpenAI-compatible base URL, e.g. http://ollama:11434/v1
	Model    string
	APIKey   string
	// ReasoningEffort ("low", "medium", "high") is sent only when set, for
	// reasoning models that would otherwise think past the timeout.
	ReasoningEffort string
}

// Provider asks a model to fill the contract. Implementations must respect
// ctx's deadline.
type Provider interface {
	Complete(ctx context.Context, cfg Config, text string, l Lookups) (*Result, error)
}

// Parser runs the provider with a timeout and always returns a Result.
type Parser struct {
	Config   func(ctx context.Context) Config
	Provider Provider // nil means manual only
}

// Fallback is the manual form: raw text in the title, everything else blank.
func Fallback(text, reason string) Result {
	t := strings.TrimSpace(text)
	r := Result{Title: &t, Fallback: true, FallbackReason: reason, Subtypes: []string{}}
	r.Entries = []Result{r}
	return r
}

// MaxEntries caps how many entries one line can become.
const MaxEntries = 6

// normaliseAll checks each entry the model gave against the lookups and
// returns the first with all of them in Entries.
func normaliseAll(raw Result, text string, l Lookups) Result {
	list := raw.Entries
	if len(list) == 0 {
		list = []Result{raw}
	}
	if len(list) > MaxEntries {
		list = list[:MaxEntries]
	}
	out := make([]Result, 0, len(list))
	for _, e := range list {
		e.Entries = nil
		out = append(out, Normalise(e, text, l))
	}
	first := out[0]
	first.Entries = out
	return first
}

// Parse returns the filled form for text. It never returns an error.
func (p *Parser) Parse(ctx context.Context, text string, l Lookups) Result {
	if p == nil || p.Provider == nil || p.Config == nil {
		return Fallback(text, "no capture provider configured")
	}
	cfg := p.Config(ctx)
	if cfg.Endpoint == "" || cfg.Model == "" {
		return Fallback(text, "no capture provider configured")
	}
	return p.parseWithProvider(ctx, cfg, text, l)
}
