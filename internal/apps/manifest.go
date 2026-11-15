// Package apps connects Reskon to other apps (plugins): it reads an app's
// description file, signs in to it, and keeps each person's connected apps
// in their own file. The contract is docs/plugins.md; the reasons are in
// docs/decisions.md ("Plugins (connected apps) and live updates").
//
// This package makes network calls, so the phone never uses it: the phone's
// networking is in Kotlin.
package apps

import (
	"encoding/json"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strings"
	"unicode"
)

// ContractVersion is the only "reskon_app" value this Reskon understands.
const ContractVersion = 1

// ManifestPath is where every app serves its description file.
const ManifestPath = "/.well-known/reskon-app.json"

// Auth kinds.
const (
	AuthNone     = "none"
	AuthToken    = "token"
	AuthPassword = "password"
)

// Shapes a data widget may answer with (docs/plugins.md section 6.2).
var Shapes = []string{"number", "series", "table", "checklist", "list"}

// Manifest is an app's description file.
type Manifest struct {
	ReskonApp  int      `json:"reskon_app"`
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Version    string   `json:"version"`
	HomeURL    string   `json:"home_url"`
	Icon       string   `json:"icon"`
	Auth       Auth     `json:"auth"`
	LaunchURL  string   `json:"launch_url,omitempty"`
	ConnectURL string   `json:"connect_url,omitempty"`
	Widgets    []Widget `json:"widgets"`
}

type Auth struct {
	Kind     string `json:"kind"`
	LoginURL string `json:"login_url,omitempty"`
}

type Size struct {
	W int `json:"w"`
	H int `json:"h"`
}

// Widget is one widget an app offers.
type Widget struct {
	ID     string   `json:"id"`
	Title  string   `json:"title"`
	Kind   string   `json:"kind"` // page or data
	URL    string   `json:"url"`
	Size   Size     `json:"size"`
	Style  string   `json:"style,omitempty"`  // page: reskon or own
	Shape  string   `json:"shape,omitempty"`  // data
	Ranged bool     `json:"ranged,omitempty"` // data
	Groups []string `json:"groups,omitempty"` // data
}

var idPattern = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)

// Invalid is a problem with what an app or a person sent. Its message is
// written for the person and is safe to show.
type Invalid struct{ Msg string }

func (e *Invalid) Error() string { return e.Msg }

func invalid(format string, a ...any) error { return &Invalid{Msg: fmt.Sprintf(format, a...)} }

// NormalizeAddress checks an address a person typed and returns it as a
// base: scheme and host (and a path prefix, if any), without a trailing
// slash, query or fragment. Example: "192.168.0.8:5000/" gives
// "http://192.168.0.8:5000".
func NormalizeAddress(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", invalid("type the app's address, such as http://192.168.0.8:5000")
	}
	if !strings.Contains(s, "://") {
		s = "http://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return "", invalid("%q is not a web address", raw)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", invalid("the address must start with http:// or https://")
	}
	if u.User != nil {
		return "", invalid("leave the username and password out of the address; Reskon asks for them")
	}
	if u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return "", invalid("leave ?… and #… out of the address")
	}
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawPath = ""
	return u.String(), nil
}

// maxURL caps any address in a description file.
const maxURL = 2048

// Resolve turns an address from a description file into a full one. A
// relative address is taken from the app's base; a full one must be on the
// app's own address: same scheme and host, and under the base's path (an app
// connected at http://host/habits cannot send Reskon to http://host/food,
// another app behind the same server).
func Resolve(base, ref string) (string, error) {
	b, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	if len(ref) > maxURL {
		return "", invalid("an address in the app's description is longer than %d characters", maxURL)
	}
	r, err := url.Parse(ref)
	if err != nil || r.User != nil || r.Fragment != "" {
		return "", invalid("%q is not an address Reskon can use", short(ref))
	}
	var out *url.URL
	if r.IsAbs() || r.Host != "" {
		out = b.ResolveReference(r)
	} else {
		// Relative to the base, including a base with a path prefix.
		joined := *b
		joined.Path = strings.TrimRight(b.Path, "/") + "/" + strings.TrimLeft(r.Path, "/")
		joined.RawPath = ""
		joined.RawQuery = r.RawQuery
		out = &joined
	}
	// ".." could step out of the base's path: clean it first.
	cleaned := path.Clean("/" + out.Path)
	if strings.HasSuffix(out.Path, "/") && cleaned != "/" {
		cleaned += "/"
	}
	out.Path, out.RawPath = cleaned, ""
	basePath := strings.TrimRight(b.Path, "/")
	inside := basePath == "" || out.Path == basePath || strings.HasPrefix(out.Path, basePath+"/")
	if out.Scheme != b.Scheme || out.Host != b.Host || out.User != nil || !inside {
		return "", invalid("%q is not on the app's own address %s", short(ref), base)
	}
	return out.String(), nil
}

// plainText checks a name or title from an app: a length limit, and no
// control, direction-changing or invisible format characters (zero-width
// spaces, byte-order marks, soft hyphens, tags), which could disguise text.
func plainText(field, s string, max int, required bool) error {
	if required && s == "" {
		return invalid("%s must not be empty", field)
	}
	if len(s) > max {
		return invalid("%s must be %d characters at most", field, max)
	}
	for _, r := range s {
		if unicode.IsControl(r) || unicode.Is(unicode.Bidi_Control, r) || unicode.Is(unicode.Cf, r) {
			return invalid("%s holds a control character", field)
		}
	}
	return nil
}

// ParseManifest reads and checks a description file. Every address in it
// must be on base's host. The messages say what to fix.
func ParseManifest(base string, data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, invalid("the app's description file is not valid JSON")
	}
	if m.ReskonApp != ContractVersion {
		return nil, invalid("the app is written for Reskon plugin contract version %d; this Reskon understands version %d", m.ReskonApp, ContractVersion)
	}
	if !idPattern.MatchString(m.ID) {
		return nil, invalid("the app's id must be 1 to 40 lower-case letters, digits or _")
	}
	m.Name = strings.TrimSpace(m.Name)
	if err := plainText("the app's name", m.Name, 80, true); err != nil {
		return nil, err
	}
	if err := plainText("the app's version", m.Version, 40, false); err != nil {
		return nil, err
	}
	if err := plainText("the app's icon", m.Icon, 40, false); err != nil {
		return nil, err
	}
	check := func(field, ref string, required bool) error {
		if ref == "" {
			if required {
				return invalid("the app's description has no %s", field)
			}
			return nil
		}
		if _, err := Resolve(base, ref); err != nil {
			return invalid("%s: %s", field, err.Error())
		}
		return nil
	}
	if m.HomeURL == "" {
		m.HomeURL = "/"
	}
	if err := check("home_url", m.HomeURL, true); err != nil {
		return nil, err
	}
	switch m.Auth.Kind {
	case AuthNone, AuthToken:
	case AuthPassword:
		if err := check("auth.login_url", m.Auth.LoginURL, true); err != nil {
			return nil, err
		}
	default:
		return nil, invalid("auth.kind must be none, token or password")
	}
	if err := check("launch_url", m.LaunchURL, false); err != nil {
		return nil, err
	}
	if err := check("connect_url", m.ConnectURL, false); err != nil {
		return nil, err
	}
	if len(m.Widgets) > 50 {
		return nil, invalid("an app may offer at most 50 widgets")
	}
	seen := map[string]bool{}
	for i := range m.Widgets {
		w := &m.Widgets[i]
		where := fmt.Sprintf("widget %d", i+1)
		if !idPattern.MatchString(w.ID) {
			return nil, invalid("%s: the id must be 1 to 40 lower-case letters, digits or _", where)
		}
		if seen[w.ID] {
			return nil, invalid("%s: the id %q is used twice", where, w.ID)
		}
		seen[w.ID] = true
		where = fmt.Sprintf("widget %q", w.ID)
		w.Title = strings.TrimSpace(w.Title)
		if err := plainText(where+": the title", w.Title, 80, true); err != nil {
			return nil, err
		}
		if err := check(where+" url", w.URL, true); err != nil {
			return nil, err
		}
		if w.Size.W == 0 {
			w.Size.W = 4
		}
		if w.Size.H == 0 {
			w.Size.H = 4
		}
		if w.Size.W < 1 || w.Size.W > 12 || w.Size.H < 1 || w.Size.H > 12 {
			return nil, invalid("%s: size w and h must be 1 to 12", where)
		}
		switch w.Kind {
		case "page":
			if w.Style == "" {
				w.Style = "reskon"
			}
			if w.Style != "reskon" && w.Style != "own" {
				return nil, invalid("%s: style must be reskon or own", where)
			}
			w.Shape, w.Ranged, w.Groups = "", false, nil
		case "data":
			if !contains(Shapes, w.Shape) {
				return nil, invalid("%s: shape must be one of %s", where, strings.Join(Shapes, ", "))
			}
			if len(w.Groups) > 20 {
				return nil, invalid("%s: at most 20 groups", where)
			}
			for _, g := range w.Groups {
				if !idPattern.MatchString(g) {
					return nil, invalid("%s: a group must be 1 to 40 lower-case letters, digits or _", where)
				}
			}
			w.Style = ""
		default:
			return nil, invalid("%s: kind must be page or data", where)
		}
	}
	return &m, nil
}

// short cuts text from an app's description before it goes in a message,
// so an app cannot fill Reskon's screens with its own words.
func short(s string) string {
	if len(s) > 80 {
		return s[:80] + "…"
	}
	return s
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
