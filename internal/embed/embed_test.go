package embed

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// The tokenizer against a tiny vocabulary: BERT's punctuation, accent and
// WordPiece rules. Whole-model checks need the files (below).
func TestTokenizer(t *testing.T) {
	dir := t.TempDir()
	vocab := "[PAD]\n[UNK]\n[CLS]\n[SEP]\nfix\nbank\n!\ncafe\nun\n##know\n##n\n(\n)\nv\n0\n.\n2"
	if err := os.WriteFile(filepath.Join(dir, "vocab.txt"), []byte(vocab), 0o644); err != nil {
		t.Fatal(err)
	}
	tok, err := loadTokenizer(filepath.Join(dir, "vocab.txt"))
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string][]int32{
		"Fix BANK!":   {2, 4, 5, 6, 3},
		"Café":        {2, 7, 3},
		"unknown":     {2, 8, 9, 10, 3},
		"zebra":       {2, 1, 3},
		"(v0.2)":      {2, 11, 1, 15, 16, 12, 3}, // "v0" has no "##0" piece: the whole word is [UNK]
		"  \tfix\n  ": {2, 4, 3},
	}
	for in, want := range cases {
		if got := tok.encode(in, MaxTokens); !slices.Equal(got, want) {
			t.Errorf("encode(%q) = %v, want %v", in, got, want)
		}
	}
	if got := tok.encode("fix fix fix fix", 4); !slices.Equal(got, []int32{2, 4, 4, 3}) {
		t.Errorf("cut to 4 = %v", got)
	}
}

// With the model on disk (JITTERBUG_EMBED_TEST_DIR), titles that mean the
// same thing land closer than ones that don't.
func TestModelMeaning(t *testing.T) {
	dir := os.Getenv("JITTERBUG_EMBED_TEST_DIR")
	if dir == "" || !Present(dir) {
		t.Skip("set JITTERBUG_EMBED_TEST_DIR to a folder with the model files")
	}
	m, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	a := m.Embed("Order a replacement hard drive for the NVR")
	b := m.Embed("Buy a new disk for the video recorder")
	c := m.Embed("Plan the birthday party menu")
	if ab, ac := Cosine(a, b), Cosine(a, c); ab <= ac+0.2 {
		t.Errorf("similar %.3f, unrelated %.3f", ab, ac)
	}
	if s := Cosine(a, a); s < 0.999 || s > 1.001 {
		t.Errorf("self cosine %.4f", s)
	}
}
