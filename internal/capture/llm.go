package capture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Timeout is how long the model gets before capture falls back to the
// manual form.
const Timeout = 5 * time.Second

// parseWithProvider runs the model with the timeout, then checks every
// field it returned against the real lookups.
func (p *Parser) parseWithProvider(ctx context.Context, cfg Config, text string, l Lookups) Result {
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	raw, err := p.Provider.Complete(ctx, cfg, text, l)
	if err != nil {
		reason := "capture model unavailable: " + err.Error()
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			reason = "capture model took longer than 5 seconds"
		}
		return Fallback(text, reason)
	}
	return Normalise(*raw, text, l)
}

// OpenAI talks to any OpenAI-compatible /chat/completions endpoint, local
// (Ollama, llama.cpp, LM Studio) or hosted.
type OpenAI struct {
	Client *http.Client
}

func (o OpenAI) Complete(ctx context.Context, cfg Config, text string, l Lookups) (*Result, error) {
	body, _ := json.Marshal(map[string]any{
		"model":           cfg.Model,
		"temperature":     0,
		"response_format": map[string]string{"type": "json_object"},
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt(l)},
			{"role": "user", "content": text},
		},
	})
	url := strings.TrimRight(cfg.Endpoint, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}
	client := o.Client
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, truncate(string(data), 200))
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Choices) == 0 {
		return nil, fmt.Errorf("unexpected response: %s", truncate(string(data), 200))
	}
	return decodeContent(out.Choices[0].Message.Content)
}

// decodeContent pulls the JSON object out of the model's reply, tolerating
// code fences or prose around it.
func decodeContent(content string) (*Result, error) {
	start, end := strings.Index(content, "{"), strings.LastIndex(content, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("model reply has no JSON object")
	}
	var r Result
	if err := json.Unmarshal([]byte(content[start:end+1]), &r); err != nil {
		return nil, fmt.Errorf("model reply is not the contract: %v", err)
	}
	return &r, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func systemPrompt(l Lookups) string {
	var b strings.Builder
	b.WriteString(`You turn one line a person typed about their day into JSON. Reply with one JSON object and nothing else:
{"intent": "session"|"task", "kind": "task"|"event", "title": string, "energy_type": string, "hours": number, "difficulty": 1-5 (1 easy, 5 hardest), "subtypes": [string], "area": string, "matched_task_key": string, "confidence": number}

Rules:
- Past tense (something that happened) -> intent "session". Future, intention or imperative ("need to", "should", "buy X") -> intent "task".
- kind "event" is for things that happened but are not work: a bath, a meal, a nap, gaming, time with people. Work, chores and errands are kind "task".
- Use null for anything the text does not say. Do not guess hours, difficulty or area.
- energy_type, subtypes and area must be copied exactly from the lists below, or null.
- matched_task_key: only if the text is clearly about one of the open tasks listed below; copy its key exactly. Never invent a key. Events never match a task.
- title: a short clean title in the person's words, without the duration.
- confidence: 0 to 1, how sure you are of intent and kind.

`)
	fmt.Fprintf(&b, "Energy types: %s\n", strings.Join(l.EnergyTypes, ", "))
	for _, et := range l.EnergyTypes {
		if sts := l.Subtypes[et]; len(sts) > 0 {
			fmt.Fprintf(&b, "Subtypes of %s: %s\n", et, strings.Join(sts, ", "))
		}
	}
	if len(l.Areas) > 0 {
		fmt.Fprintf(&b, "Areas: %s\n", strings.Join(l.Areas, ", "))
	}
	if len(l.Candidates) > 0 {
		b.WriteString("Open tasks that may match:\n")
		for _, c := range l.Candidates {
			fmt.Fprintf(&b, "- %s: %s\n", c.Key, c.Title)
		}
	} else {
		b.WriteString("Open tasks that may match: none\n")
	}
	return b.String()
}
