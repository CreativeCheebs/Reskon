package db

import (
	"encoding/json"
	"strings"
	"unicode"
	"unicode/utf16"
)

// The setting "terms" lets a person call tasks and epics by their own words
// ("todo", "card", "story"). It is only what the screens show: the API, the
// database, the spec's vocabulary and error messages keep saying task and
// epic. The value is a JSON object with any of these keys, each a short word
// or phrase in the lower case the person wants it used mid-sentence:
//
//	{"task": "todo", "tasks": "todos", "epic": "theme", "epics": "themes"}
//
// A key left out means the default.
var termKeys = map[string]bool{"task": true, "tasks": true, "epic": true, "epics": true}

// The longest word, counted in UTF-16 units, which is how the web and the
// phone count, so a word the server accepts is never dropped by a screen.
const maxTermLength = 24

// normaliseTerms checks the value of the "terms" setting and returns it with
// each word trimmed. A word must be 1 to 24 characters of letters, digits,
// the marks that belong to letters in many scripts, spaces, hyphens or
// apostrophes, with at least one letter or digit, so it reads cleanly in a
// menu or a sentence.
func normaliseTerms(value json.RawMessage) (json.RawMessage, error) {
	var in map[string]json.RawMessage
	if err := json.Unmarshal(value, &in); err != nil || in == nil {
		return nil, invalid("terms must be an object such as {\"task\": \"todo\", \"tasks\": \"todos\"}")
	}
	out := make(map[string]string, len(in))
	for k, raw := range in {
		if !termKeys[k] {
			return nil, invalid("terms: %q is not a name that can be changed (task, tasks, epic, epics)", k)
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return nil, invalid("terms: %s must be text", k)
		}
		s = strings.TrimSpace(s)
		if s == "" || len(utf16.Encode([]rune(s))) > maxTermLength {
			return nil, invalid("terms: %s must be 1 to %d characters", k, maxTermLength)
		}
		named := false
		for _, r := range s {
			letter := unicode.IsLetter(r) || unicode.IsDigit(r)
			if !letter && !unicode.IsMark(r) && r != ' ' && r != '-' && r != '\'' && r != '’' {
				return nil, invalid("terms: %s may only have letters, digits, spaces, hyphens and apostrophes", k)
			}
			named = named || letter
		}
		if !named {
			return nil, invalid("terms: %s needs at least one letter or digit", k)
		}
		out[k] = s
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return b, nil
}
