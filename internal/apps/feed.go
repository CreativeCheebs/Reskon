package apps

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"jitterbug/internal/db"
)

// Data widgets (docs/plugins.md section 6): Reskon's server asks the app's
// feed for its data with the token it keeps, checks the answer, keeps a
// copy, and hands the browser only the checked result. When the app cannot
// be asked or answers badly, the last copy is shown instead, marked stale
// with when it was made and why it is not fresh.

// DataRequest is one data widget's question to its app.
type DataRequest struct {
	App, Widget string
	// Range is the widget's own range ("7d"), counted back from Today; From
	// and To (the dashboard's dates) replace it. Both only for a ranged feed.
	Range    string
	From, To string
	Group    string
	// TZ is the person's time zone, e.g. Asia/Kolkata; Today is their today.
	TZ    string
	Today string
	// Viz is the chart type it is drawn as (a cumulative chart gets running
	// totals).
	Viz string
}

// MaxSpanDays is the longest span of dates an app is asked for.
const MaxSpanDays = 400

// DataWidget finds one of the app's data widgets, as its last description
// lists it.
func DataWidget(a *App, widgetID string) (*Widget, error) {
	if a.Manifest == nil {
		return nil, invalid("check %s again in Settings › Apps first: %s", a.Name, a.StatusDetail)
	}
	for i := range a.Manifest.Widgets {
		w := &a.Manifest.Widgets[i]
		if w.ID == widgetID {
			if w.Kind != "data" {
				return nil, invalid("%s's widget %q is a web page, not data", a.Name, widgetID)
			}
			return w, nil
		}
	}
	return nil, &Gone{Msg: a.Name + " no longer offers the data \"" + widgetID + "\"; remove this widget or check " + a.Name + " again in Settings › Apps"}
}

// feedParams works out what the feed is asked: from, to, group and tz as the
// app receives them, and the cache key, which names the widget's range
// ("range=7d") rather than its dates, so yesterday's copy of "the last 7
// days" is still there to show today when the app is down.
func feedParams(w *Widget, req DataRequest) (ask url.Values, key string, from, to, group string, err error) {
	ask, k := url.Values{}, url.Values{}
	if len(w.Groups) > 0 {
		group = req.Group
		if group == "" {
			group = w.Groups[0]
		}
		if !contains(w.Groups, group) {
			return nil, "", "", "", "", invalid("this data widget cannot be grouped by %q", short(group))
		}
		ask.Set("group", group)
		k.Set("group", group)
	}
	if w.Ranged {
		if req.From != "" || req.To != "" {
			if !db.ValidDates(req.From, req.To) {
				return nil, "", "", "", "", invalid("from and to must both be YYYY-MM-DD, from not after to")
			}
			// The longest range a widget can choose is a year: dates may span
			// a little more, never years of an app's data.
			f, _ := time.Parse("2006-01-02", req.From)
			t, _ := time.Parse("2006-01-02", req.To)
			if t.Sub(f) > MaxSpanDays*24*time.Hour {
				return nil, "", "", "", "", invalid("an app's data can be asked for at most %d days at a time", MaxSpanDays)
			}
			from, to = req.From, req.To
			k.Set("from", from)
			k.Set("to", to)
		} else {
			if from, to, err = db.ResolveAppRange(req.Range, req.Today); err != nil {
				return nil, "", "", "", "", err
			}
			rng := req.Range
			if rng == "" {
				rng = "7d"
			}
			k.Set("range", rng)
		}
		ask.Set("from", from)
		ask.Set("to", to)
	}
	ask.Set("tz", req.TZ)
	k.Set("tz", req.TZ)
	return ask, k.Encode(), from, to, group, nil
}

// Data answers one data widget: fresh from the app when it can be asked,
// else the last copy, marked stale. With no copy, the error says why.
func (s *Store) Data(ctx context.Context, c *Client, req DataRequest) (*DataResult, error) {
	a, err := s.GetByAppID(ctx, req.App)
	if errors.Is(err, ErrNotFound) {
		return nil, &Gone{Msg: "the app \"" + req.App + "\" is not connected; connect it in Settings › Apps, or remove this widget"}
	}
	if err != nil {
		return nil, err
	}
	w, err := DataWidget(a, req.Widget)
	if err != nil {
		return nil, err
	}
	// The app may have changed the shape since the widget was saved.
	if req.Viz != "" && !contains(db.AppDataVizzes[w.Shape], req.Viz) {
		return nil, invalid("%s now sends this as a %s, which cannot be drawn as %s: edit this widget and choose another chart type", a.Name, w.Shape, req.Viz)
	}
	ask, key, from, to, group, err := feedParams(w, req)
	if err != nil {
		return nil, err
	}
	fresh, why := s.fetch(ctx, c, a, w, ask, group, from, to)
	if why == nil {
		// A copy that cannot be stored is no reason to withhold a good answer.
		_ = s.cachePut(ctx, a.ID, w.ID, key, fresh)
		fresh.AppName = a.Name
		return fresh.ForViz(req.Viz), nil
	}
	old, err := s.cacheGet(ctx, a.ID, w.ID, key, w.Shape)
	if err != nil {
		return nil, err
	}
	if old == nil {
		return nil, why
	}
	old.Stale, old.StaleReason, old.AppName = true, reasonOf(why), a.Name
	return old.ForViz(req.Viz), nil
}

// fetch asks the app's feed once and checks its answer. Its error is
// written for the person and never holds the app's own words.
func (s *Store) fetch(ctx context.Context, c *Client, a *App, w *Widget, ask url.Values, group, from, to string) (*DataResult, error) {
	if a.Status == StatusInvalid {
		// Another app may answer at that address now: never send it the token.
		return nil, invalid("check %s again in Settings › Apps first: %s", a.Name, a.StatusDetail)
	}
	if a.AuthKind != AuthNone && a.Token() == "" {
		return nil, invalid("sign in to %s again in Settings › Apps", a.Name)
	}
	feed, err := Resolve(a.Address, w.URL)
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(feed)
	if err != nil {
		return nil, invalid("%s's data address cannot be used", a.Name)
	}
	// The feed's own query (if any) is kept; Reskon's parameters win.
	q := u.Query()
	for k, v := range ask {
		q[k] = v
	}
	u.RawQuery = q.Encode()
	data, err := c.do(ctx, http.MethodGet, u.String(), a.Token(), nil)
	var un *Unreachable
	switch {
	case errors.Is(err, ErrSignIn) || errors.As(err, &un) && un.Status == http.StatusForbidden:
		return nil, invalid("%s refused Reskon's sign-in: sign in to %s again in Settings › Apps", a.Name, a.Name)
	case errors.As(err, &un):
		// The message names the address asked; the app's name reads better
		// and keeps the parameters out of it.
		return nil, &Unreachable{Msg: strings.ReplaceAll(un.Msg, u.String(), a.Name), Status: un.Status}
	case err != nil:
		return nil, err
	}
	res, err := ParseAnswer(data, w.Shape, group, from, to, time.Now())
	var inv *Invalid
	if errors.As(err, &inv) {
		return nil, invalid("%s sent data Reskon cannot use: %s", a.Name, inv.Msg)
	}
	return res, err
}

// reasonOf is the short note shown beside a stale copy.
func reasonOf(err error) string {
	var inv *Invalid
	var un *Unreachable
	switch {
	case errors.As(err, &inv):
		return inv.Msg
	case errors.As(err, &un):
		return un.Msg
	}
	return "the app could not be asked"
}
