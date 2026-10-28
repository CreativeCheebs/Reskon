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

	// Not part of the model's contract; filled in by the server.
	MatchedTaskID  *int64 `json:"matched_task_id"`
	Fallback       bool   `json:"fallback"`        // true when the model was not used
	FallbackReason string `json:"fallback_reason"` // why, for the form to show quietly
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
	return Result{Title: &t, Fallback: true, FallbackReason: reason, Subtypes: []string{}}
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
