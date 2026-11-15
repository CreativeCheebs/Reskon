package apps

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"unicode"
)

// Web page widgets (docs/plugins.md section 4). The browser loads an app's
// page straight from the app, so Reskon's server asks the app for a
// one-minute, single-use ticket with the token it keeps, and hands the
// browser only the page's address with that ticket after "#". The token
// itself never leaves the server.

// Gone is an app or page a saved widget names that is not there any more
// (the app was removed, or no longer offers that page). Its message is safe
// to show.
type Gone struct{ Msg string }

func (e *Gone) Error() string { return e.Msg }

// PageLink is what the browser loads in an app page widget's frame.
type PageLink struct {
	// URL is the page's full address, with "#ticket=…" when the app signs in.
	URL string `json:"url"`
	// Origin is the page's scheme, host and port: the only target Reskon's
	// page sends messages to.
	Origin string `json:"origin"`
	// Style is "reskon" (the page uses the colours Reskon sends) or "own".
	Style string `json:"style"`
	Title string `json:"title"`
}

// maxTicket caps the ticket an app sends; it travels in an address.
const maxTicket = 1024

// GetByAppID finds a connected app by the id in its description file.
func (s *Store) GetByAppID(ctx context.Context, appID string) (*App, error) {
	a, err := scanApp(s.sql.QueryRowContext(ctx, `SELECT `+appCols+` FROM app WHERE app_id = ?`, appID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return a, err
}

// PageWidget finds one of the app's web page widgets, as its last
// description lists it.
func PageWidget(a *App, widgetID string) (*Widget, error) {
	if a.Manifest == nil {
		return nil, invalid("check %s again in Settings › Apps first: %s", a.Name, a.StatusDetail)
	}
	for i := range a.Manifest.Widgets {
		w := &a.Manifest.Widgets[i]
		if w.ID == widgetID {
			if w.Kind != "page" {
				return nil, invalid("%s's widget %q is a data widget, not a web page", a.Name, widgetID)
			}
			return w, nil
		}
	}
	return nil, &Gone{Msg: a.Name + " no longer offers the page \"" + widgetID + "\"; remove this widget or check " + a.Name + " again in Settings › Apps"}
}

// Launch works out the address of one of the app's pages for the browser,
// asking the app for a ticket first when it signs in.
func (s *Store) Launch(ctx context.Context, c *Client, appID, widgetID string) (*PageLink, error) {
	a, err := s.GetByAppID(ctx, appID)
	if errors.Is(err, ErrNotFound) {
		return nil, &Gone{Msg: "the app \"" + appID + "\" is not connected; connect it in Settings › Apps, or remove this widget"}
	}
	if err != nil {
		return nil, err
	}
	if a.Status == StatusInvalid {
		// Another app may answer at that address now: never send it the token.
		return nil, invalid("check %s again in Settings › Apps first: %s", a.Name, a.StatusDetail)
	}
	w, err := PageWidget(a, widgetID)
	if err != nil {
		return nil, err
	}
	page, err := Resolve(a.Address, w.URL)
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(page)
	if err != nil {
		return nil, invalid("%s's page address cannot be used", a.Name)
	}
	link := &PageLink{URL: page, Origin: u.Scheme + "://" + u.Host, Style: w.Style, Title: w.Title}
	if a.AuthKind == AuthNone {
		return link, nil
	}
	if a.Token() == "" {
		return nil, invalid("sign in to %s again in Settings › Apps", a.Name)
	}
	if a.Manifest.LaunchURL == "" {
		return nil, invalid("%s has no launch_url in its description, so Reskon cannot sign its pages in", a.Name)
	}
	ticket, err := c.ticket(ctx, a, widgetID)
	if err != nil {
		return nil, err
	}
	// After "#", so the browser never sends it in a request; escaped, so a
	// ticket cannot add anything else to the address.
	link.URL += "#ticket=" + url.QueryEscape(ticket)
	return link, nil
}

// ticket asks the app for a one-time ticket for one of its pages.
func (c *Client) ticket(ctx context.Context, a *App, widgetID string) (string, error) {
	launch, err := Resolve(a.Address, a.Manifest.LaunchURL)
	if err != nil {
		return "", err
	}
	data, err := c.do(ctx, http.MethodPost, launch, a.Token(), map[string]string{"widget": widgetID})
	var un *Unreachable
	if errors.Is(err, ErrSignIn) || errors.As(err, &un) && un.Status == http.StatusForbidden {
		return "", invalid("%s refused Reskon's sign-in: sign in to %s again in Settings › Apps", a.Name, a.Name)
	}
	if err != nil {
		return "", err
	}
	var out struct {
		Ticket string `json:"ticket"`
	}
	if json.Unmarshal(data, &out) != nil || out.Ticket == "" {
		return "", invalid("%s sent no ticket for its page", a.Name)
	}
	if len(out.Ticket) > maxTicket {
		return "", invalid("%s sent a ticket longer than %d characters", a.Name, maxTicket)
	}
	for _, r := range out.Ticket {
		if r > unicode.MaxASCII || unicode.IsControl(r) || r == ' ' {
			return "", invalid("%s sent a ticket with characters that cannot go in an address", a.Name)
		}
	}
	return out.Ticket, nil
}
