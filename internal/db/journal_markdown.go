package db

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// journalMarkdown writes one day for pasting into a journal:
//
//	## Sunday 15 November 2026 — 6h 30m, 42 points
//	- 09:00–10:30 · Fix backup script (Home) — 1h 30m
//	  Found the cron path was wrong; fixed and tested.
//	- Reading (Learning) — 45m
//
// The day's heading carries the totals (summed here, never in the browser).
// A session shows its times only when it has a start time. Its note goes
// underneath, every line indented two spaces so a multi-line note stays
// inside its list item. The task key is never used.
//
// Text from the person must not change the structure around it: a name that
// starts like Markdown (# > - + * [ 1.) is escaped with a backslash, a note
// line made only of - or = (which would turn the line above into a heading)
// is escaped too, and a line that another follows ends with two spaces, so
// renderers that ignore single line breaks still keep each line on its own.
func journalMarkdown(day *JournalDay) string {
	var b strings.Builder
	title := day.Day
	if t := parseDay(day.Day); !t.IsZero() {
		title = t.Format("Monday 2 January 2006")
	}
	fmt.Fprintf(&b, "## %s — %s, %s\n", title, hoursText(day.Hours), pointsText(day.Points))
	for _, s := range day.Sessions {
		b.WriteString("- ")
		if s.Start != nil && s.End != nil {
			fmt.Fprintf(&b, "%s–%s · %s", *s.Start, *s.End, s.What)
		} else {
			b.WriteString(escapeLead(s.What)) // the name starts the list item
		}
		if s.Area != nil && *s.Area != "" {
			fmt.Fprintf(&b, " (%s)", strings.Join(strings.Fields(*s.Area), " "))
		}
		fmt.Fprintf(&b, " — %s", hoursText(s.Hours))
		if s.Note == nil {
			b.WriteString("\n")
			continue
		}
		b.WriteString(breakIfMore(true)) // another line (the note) follows
		lines := strings.Split(*s.Note, "\n")
		for i, line := range lines {
			if line == "" {
				b.WriteString("\n")
				continue
			}
			b.WriteString("  " + escapeRule(line))
			// Two trailing spaces keep the line break where the next line is not blank.
			b.WriteString(breakIfMore(i+1 < len(lines) && lines[i+1] != ""))
		}
	}
	return b.String()
}

// breakIfMore ends a line: with two spaces first (a hard line break) when
// another non-blank line follows.
func breakIfMore(more bool) string {
	if more {
		return "  \n"
	}
	return "\n"
}

// escapeLead puts a backslash before a name that would start a heading,
// quote, list, task box or numbered list.
func escapeLead(s string) string {
	if s == "" {
		return s
	}
	if strings.ContainsRune("#>-+*[`|_~", rune(s[0])) {
		return "\\" + s
	}
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if i > 0 && i < len(s) && (s[i] == '.' || s[i] == ')') {
		return s[:i] + "\\" + s[i:]
	}
	return s
}

// escapeRule escapes a note line made only of - or = characters, which
// under a line of text would turn that text into a heading.
func escapeRule(line string) string {
	t := strings.TrimSpace(line)
	if t != "" && (strings.Trim(t, "-") == "" || strings.Trim(t, "=") == "") {
		return "\\" + line
	}
	return line
}

// hoursText is hours as "6h 30m", "45m" or "2h", to the nearest minute.
func hoursText(h float64) string {
	mins := int(math.Round(h * 60))
	hh, mm := mins/60, mins%60
	switch {
	case hh > 0 && mm > 0:
		return fmt.Sprintf("%dh %dm", hh, mm)
	case hh > 0:
		return fmt.Sprintf("%dh", hh)
	}
	return fmt.Sprintf("%dm", mm)
}

// pointsText is "42 points" or "1 point", with up to two decimals ("12.5 points").
func pointsText(p float64) string {
	p = math.Round(p*100) / 100
	n := strconv.FormatFloat(p, 'f', -1, 64)
	if n == "1" {
		return "1 point"
	}
	return n + " points"
}
