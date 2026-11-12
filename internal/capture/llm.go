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
	return normaliseAll(*raw, text, l)
}

// OpenAI talks to any OpenAI-compatible /chat/completions endpoint, local
// (Ollama, llama.cpp, LM Studio) or hosted.
type OpenAI struct {
	Client *http.Client
}

func (o OpenAI) Complete(ctx context.Context, cfg Config, text string, l Lookups) (*Result, error) {
	req := map[string]any{
		"model":           cfg.Model,
		"temperature":     0,
		"response_format": map[string]string{"type": "json_object"},
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt(l)},
			{"role": "user", "content": text},
		},
	}
	if cfg.ReasoningEffort != "" {
		req["reasoning_effort"] = cfg.ReasoningEffort
	}
	body, _ := json.Marshal(req)
	url := strings.TrimRight(cfg.Endpoint, "/") + "/chat/completions"
	hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	hreq.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		hreq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}
	// Never follow a redirect: the address is whatever the user typed, and a
	// redirect is another way to reach somewhere they should not.
	client := http.Client{}
	if o.Client != nil {
		client = *o.Client
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	res, err := client.Do(hreq)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		// The status only: the body came from an address the user chose, and
		// quoting it back would let them read whatever that address answers.
		return nil, fmt.Errorf("HTTP %d from the model endpoint", res.StatusCode)
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Choices) == 0 {
		return nil, fmt.Errorf("the model endpoint did not answer in the expected format")
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
	return decodeObject([]byte(content[start:end+1]), 0)
}

// decodeObject reads the contract from obj. Some models wrap it, e.g.
// {"name": "response", "type": "json_object", "value": {...}}: when obj
// has none of the contract's keys, the one object inside it is tried
// instead.
func decodeObject(obj []byte, depth int) (*Result, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(obj, &fields); err != nil {
		return nil, fmt.Errorf("model reply is not the contract: %v", err)
	}
	for _, k := range []string{"entries", "intent", "kind", "title", "energy_type", "hours", "area"} {
		if _, ok := fields[k]; ok {
			var r Result
			if err := json.Unmarshal(obj, &r); err != nil {
				return nil, fmt.Errorf("model reply is not the contract: %v", err)
			}
			if k == "entries" && len(r.Entries) == 0 && r.Intent == nil && r.Title == nil {
				return nil, fmt.Errorf("model reply has no entries")
			}
			return &r, nil
		}
	}
	if depth < 2 {
		var inner []json.RawMessage
		for _, v := range fields {
			if t := bytes.TrimSpace(v); len(t) > 0 && t[0] == '{' {
				inner = append(inner, t)
			}
		}
		if len(inner) == 1 {
			return decodeObject(inner[0], depth+1)
		}
	}
	return nil, fmt.Errorf("model reply has none of the contract's fields")
}

func systemPrompt(l Lookups) string {
	var b strings.Builder
	b.WriteString(`You turn one line a person typed about their day into JSON entries. Reply with one JSON object and nothing else:
{"entries": [{"intent": "session"|"task", "kind": "task"|"event", "title": string, "energy_type": string, "energies": [{"energy_type": string, "share": percent, "difficulty": 1-5}], "hours": number, "difficulty": 1-5, "subtypes": [string], "tags": [string], "area": string, "matched_task_key": string, "confidence": number}]}
Do not wrap it in another object.

Entries:
- Usually the line is one entry. Make several only when it describes separate activities, each with its own time or purpose.
- When a total is split ("6 hours at the hospital, work was only 1 hour, grandfather's diagnosis took the rest"), give each part its own entry and make the parts add up to the total: work 1 hour, grandfather's diagnosis 5 hours.
- At most 6 entries.
- Separate activities at different times are separate entries. One activity that involves several energy types at the same time is one entry with "energies" (see below).

Rules for each entry:
- Past tense (something that happened) -> intent "session". Future, intention or imperative ("need to", "should", "buy X") -> intent "task".
- kind "event" is for things that happened but are not work: a bath, a meal, a nap, gaming, time with people. Work, chores and errands are kind "task".
- Use null for anything the text does not say. Do not guess hours.
- energy_type: always pick the closest type from the list for the activity itself (coding or electronics -> Engineering-like, games or shows -> Leisure-like, exercise -> Physical-like, errands and paperwork -> Admin-like). Null only if none fits.
- energies: only when one activity clearly involves two or more energy types at once ("studied for the exam with friends" -> Learning 70, Leisure 30; "gym with my brother, caught up the whole time" -> Physical 60, Leisure 40). Shares are percents of the activity's time and add up to 100; each may have its own difficulty. energy_type is then the first of them. Otherwise null.
- hours: the duration in hours; convert minutes (180 mins -> 3, 45 min -> 0.75).
- difficulty is how intense or hard it was: 1 light, 2 moderate, 3 intense, 4 very intense, 5 extreme. Set it only when the text describes it ("it was intense" -> 3, "exhausting" -> 4, "easy" -> 1).
- area: the part of life it belongs to, only when that is clear from the text (gaming, hobbies, family, chores and health belong to a personal area, not a job; plain "work" or "my work" means the job area). Otherwise null.
- energy_type, subtypes and area must be copied exactly from the lists below, or null.
- tags: up to 5 tags from the Tags list below that clearly apply to the entry, copied exactly; [] when none fit. Never make up a tag. A word the person typed with a # is a tag they mean.
- matched_task_key: only if the text is clearly about one of the open tasks listed below; copy its key exactly. Never invent a key. Events never match a task.
- title: a short name for the thing itself, like a list entry, not the sentence. Drop the verb, the duration and how it felt. "Played video game Quantum Break for 3 hours, it was intense" -> "Video game - Quantum Break". "Worked on the stm32 demo for 2 hours" -> "STM32 demo". "Need to order a replacement NVR drive" -> "Order replacement NVR drive". Never copy the whole sentence; a title is a few words.
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
	if len(l.Tags) > 0 {
		fmt.Fprintf(&b, "Tags: %s\n", strings.Join(l.Tags, ", "))
	} else {
		b.WriteString("Tags: none\n")
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
