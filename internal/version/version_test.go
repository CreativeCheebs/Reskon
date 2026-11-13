package version

import (
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestUpdatedIsARealDayNotInTheFuture(t *testing.T) {
	d, err := time.Parse("2006-01-02", Updated)
	if err != nil {
		t.Fatalf("Updated is %q, want year-month-day: %v", Updated, err)
	}
	if d.After(time.Now().Add(48 * time.Hour)) {
		t.Errorf("Updated %s is in the future", Updated)
	}
}

func TestVersionMatchesTheVersionFile(t *testing.T) {
	b, err := os.ReadFile("../../VERSION")
	if err != nil {
		t.Fatal(err)
	}
	file := strings.TrimSpace(string(b))
	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(file) {
		t.Fatalf("VERSION is %q, want major.minor.patch", file)
	}
	if file != Version {
		t.Errorf("VERSION says %s but internal/version says %s: change both together", file, Version)
	}
	// The web app's package file carries the same number.
	pkg, err := os.ReadFile("../../web/package.json")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(pkg), `"version": "`+file+`"`) {
		t.Errorf("web/package.json does not say version %s", file)
	}
}
