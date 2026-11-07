package db

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// Capture never fails (AGENTS.md): pasting a whole page of text still gives a
// usable result. SQLite refuses expressions that are too deep, which a query
// with one term per word would hit.
func TestCaptureLookupsSurvivesAVeryLongPaste(t *testing.T) {
	d := openTest(t)
	var words []string
	for i := 0; i < 3000; i++ {
		words = append(words, fmt.Sprintf("word%dx", i))
	}
	if _, err := d.CaptureLookups(context.Background(), strings.Join(words, " "), 5); err != nil {
		t.Fatalf("capture must never fail: %v", err)
	}
}
