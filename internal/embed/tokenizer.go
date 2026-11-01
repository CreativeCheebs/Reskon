package embed

import (
	"bufio"
	"os"
	"strings"
	"unicode"
)

// The BERT "uncased" tokenizer: clean, lower-case, strip accents, split on
// whitespace and punctuation, then WordPiece against vocab.txt. This is
// what the model was trained with; a different split gives different
// vectors.

const maxWordChars = 100 // longer words become [UNK], as in BERT

type tokenizer struct {
	vocab         map[string]int32
	cls, sep, unk int32
}

func loadTokenizer(path string) (*tokenizer, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	t := &tokenizer{vocab: map[string]int32{}}
	sc := bufio.NewScanner(f)
	var id int32
	for sc.Scan() {
		t.vocab[strings.TrimRight(sc.Text(), "\r")] = id
		id++
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	t.cls, t.sep, t.unk = t.vocab["[CLS]"], t.vocab["[SEP]"], t.vocab["[UNK]"]
	return t, nil
}

// encode returns [CLS] tokens... [SEP], cut to max ids in all.
func (t *tokenizer) encode(text string, max int) []int32 {
	ids := []int32{t.cls}
	for _, w := range basicSplit(text) {
		ids = append(ids, t.wordPiece(w)...)
		if len(ids) >= max-1 {
			ids = ids[:max-1]
			break
		}
	}
	return append(ids, t.sep)
}

// basicSplit cleans, lower-cases, strips accents and splits into words and
// single punctuation marks. CJK characters stand alone, as in BERT.
func basicSplit(text string) []string {
	var words []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() > 0 {
			words = append(words, cur.String())
			cur.Reset()
		}
	}
	for _, r := range text {
		switch {
		case r == 0 || r == 0xFFFD || (unicode.IsControl(r) && r != '\t' && r != '\n' && r != '\r'):
			continue
		case unicode.IsSpace(r):
			flush()
		case isPunct(r) || isCJK(r):
			flush()
			words = append(words, string(r))
		default:
			if unicode.Is(unicode.Mn, r) {
				continue // a combining accent
			}
			cur.WriteString(stripAccent(unicode.ToLower(r)))
		}
	}
	flush()
	return words
}

func (t *tokenizer) wordPiece(word string) []int32 {
	runes := []rune(word)
	if len(runes) > maxWordChars {
		return []int32{t.unk}
	}
	var out []int32
	for start := 0; start < len(runes); {
		end := len(runes)
		found := int32(-1)
		for ; end > start; end-- {
			piece := string(runes[start:end])
			if start > 0 {
				piece = "##" + piece
			}
			if id, ok := t.vocab[piece]; ok {
				found = id
				break
			}
		}
		if found < 0 {
			return []int32{t.unk} // the whole word is unknown
		}
		out = append(out, found)
		start = end
	}
	return out
}

// isPunct is BERT's rule: ASCII symbols count as punctuation too ($, ^, `).
func isPunct(r rune) bool {
	if (r >= 33 && r <= 47) || (r >= 58 && r <= 64) || (r >= 91 && r <= 96) || (r >= 123 && r <= 126) {
		return true
	}
	return unicode.IsPunct(r)
}

func isCJK(r rune) bool {
	return (r >= 0x4E00 && r <= 0x9FFF) || (r >= 0x3400 && r <= 0x4DBF) || (r >= 0x20000 && r <= 0x2A6DF) ||
		(r >= 0x2A700 && r <= 0x2B73F) || (r >= 0x2B740 && r <= 0x2B81F) || (r >= 0x2B820 && r <= 0x2CEAF) ||
		(r >= 0xF900 && r <= 0xFAFF) || (r >= 0x2F800 && r <= 0x2FA1F)
}

// stripAccent maps precomposed Latin letters to their base letter, which is
// what BERT's NFD-then-drop-marks does for them. Other scripts pass through.
func stripAccent(r rune) string {
	if r < 0xC0 || r > 0x17F {
		return string(r)
	}
	if b, ok := accents[r]; ok {
		return b
	}
	return string(r)
}

var accents = func() map[rune]string {
	m := map[rune]string{}
	for base, chars := range map[string]string{
		"a": "àáâãäåāăą", "c": "çćĉċč", "d": "ď", "e": "èéêëēĕėęě", "g": "ĝğġģ", "h": "ĥ",
		"i": "ìíîïĩīĭįı", "j": "ĵ", "k": "ķ", "l": "ĺļľ", "n": "ñńņňŉ", "o": "òóôõöōŏő",
		"r": "ŕŗř", "s": "śŝşš", "t": "ţť", "u": "ùúûüũūŭůűų", "w": "ŵ", "y": "ýÿŷ", "z": "źżž",
	} {
		for _, c := range chars {
			m[c] = base
		}
	}
	return m
}()
