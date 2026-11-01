package db

import (
	"strings"
	"unicode"
)

// Word matching for duplicate search: lower-case words without the
// commonest filler, reduced to a rough stem, matched exactly, by prefix
// (the last word is often still being typed) or with one typo.

var stopWords = map[string]bool{
	"a": true, "an": true, "the": true, "to": true, "for": true, "of": true, "and": true, "or": true,
	"in": true, "on": true, "at": true, "with": true, "my": true, "is": true, "be": true, "it": true,
	"this": true, "that": true, "from": true, "by": true, "as": true, "i": true, "me": true,
}

// wordsOf splits s into stems, filler dropped.
func wordsOf(s string) []string {
	var out []string
	for _, w := range strings.FieldsFunc(strings.ToLower(s), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		if !stopWords[w] {
			out = append(out, stem(w))
		}
	}
	return out
}

// stem drops common English endings: drives, driving, drived -> driv.
// Rough, but both sides get the same treatment.
func stem(w string) string {
	switch {
	case len(w) > 4 && strings.HasSuffix(w, "ies"):
		return w[:len(w)-3] + "y"
	case len(w) > 5 && strings.HasSuffix(w, "ing"):
		return strings.TrimSuffix(w[:len(w)-3], "e")
	case len(w) > 4 && strings.HasSuffix(w, "ed"):
		return strings.TrimSuffix(w[:len(w)-2], "e")
	case len(w) > 4 && strings.HasSuffix(w, "es"):
		return strings.TrimSuffix(w[:len(w)-2], "e")
	case len(w) > 3 && strings.HasSuffix(w, "s") && !strings.HasSuffix(w, "ss"):
		return strings.TrimSuffix(w[:len(w)-1], "e")
	case len(w) > 3 && strings.HasSuffix(w, "e"):
		return w[:len(w)-1]
	}
	return w
}

// wordScore is how well a title covers the query's words, 0 to 1. Three
// quarters is how much of the query the title has, one quarter how much
// of the title is the query, so a tight match outranks a long title that
// happens to contain the words. exact reports whether any word matched
// fully (not only by prefix or typo).
func wordScore(query, title []string) (score float64, exact bool) {
	if len(query) == 0 || len(title) == 0 {
		return 0, false
	}
	used := make([]bool, len(title))
	var got float64
	for qi, q := range query {
		best, at := 0.0, -1
		for ti, t := range title {
			m := 0.0
			switch {
			case q == t:
				m = 1
			case qi == len(query)-1 && len(q) >= 3 && strings.HasPrefix(t, q):
				m = 0.9 // still typing
			case len(q) >= 3 && len(t) >= 3 && (strings.HasPrefix(q, t) || strings.HasPrefix(t, q)):
				m = 0.8
			case len(q) >= 5 && len(t) >= 5 && oneEdit(q, t):
				m = 0.8
			}
			if m > best || (m == best && m > 0 && used[at] && !used[ti]) {
				best, at = m, ti
			}
		}
		if at >= 0 {
			used[at] = true
			if best == 1 {
				exact = true
			}
		}
		got += best
	}
	hit := 0
	for _, u := range used {
		if u {
			hit++
		}
	}
	return 0.75*got/float64(len(query)) + 0.25*float64(hit)/float64(len(title)), exact
}

// oneEdit reports whether a and b differ by at most one insertion,
// deletion, substitution or swap of neighbours.
func oneEdit(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	if len(ra) < len(rb) {
		ra, rb = rb, ra
	}
	if len(ra)-len(rb) > 1 {
		return false
	}
	i := 0
	for i < len(rb) && ra[i] == rb[i] {
		i++
	}
	if i == len(rb) {
		return true
	}
	if len(ra) == len(rb) {
		if string(ra[i+1:]) == string(rb[i+1:]) {
			return true
		}
		return i+1 < len(ra) && ra[i] == rb[i+1] && ra[i+1] == rb[i] && string(ra[i+2:]) == string(rb[i+2:])
	}
	return string(ra[i+1:]) == string(rb[i:])
}
