package apps

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// "My data changed" from an app's own server (docs/plugins.md section 7).
// When an app is connected, Reskon gives it a key and the address to call
// (connect_url). Reskon never sends the app anything else: no ticks, edits
// or events.

// Values of App.Changes.
const (
	ChangesNone   = ""       // the app offers no connect_url
	ChangesOK     = "ok"     // the app took the key
	ChangesFailed = "failed" // it did not; ChangesDetail says why
)

// Hand gives the app the address it calls when its data changes and the key
// for that call, at its connect_url, signed in with its token. The app may
// answer 200 or 204; anything else is a failure, said in Reskon's words.
// key is a secret: it is never put in an error.
func (c *Client) Hand(ctx context.Context, a *App, changedURL, key string) error {
	if a.Manifest == nil || a.Manifest.ConnectURL == "" {
		return invalid("%s has no connect_url", a.Name)
	}
	target, err := Resolve(a.Address, a.Manifest.ConnectURL)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	body, _ := json.Marshal(map[string]string{"changed_url": changedURL, "key": key})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return &Unreachable{Msg: fmt.Sprintf("%s is not an address Reskon can call", target)}
	}
	req.Header.Set("Content-Type", "application/json")
	if t := a.Token(); t != "" {
		req.Header.Set("Authorization", "Bearer "+t)
	}
	res, err := c.http().Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return &Unreachable{Msg: fmt.Sprintf("no answer from %s within %d seconds", target, int(Timeout.Seconds()))}
		}
		return &Unreachable{Msg: fmt.Sprintf("could not reach %s", target)}
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, MaxReply)) // the answer means nothing; read so the connection can be reused
	switch {
	case res.StatusCode == http.StatusOK || res.StatusCode == http.StatusNoContent:
		return nil
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return invalid("%s refused Reskon's sign-in at %s: sign in to %s again", a.Name, target, a.Name)
	default:
		return &Unreachable{Msg: fmt.Sprintf("%s answered HTTP %d", target, res.StatusCode), Status: res.StatusCode}
	}
}

// SetChanges records whether the app took its key (App.Changes).
func (s *Store) SetChanges(ctx context.Context, id int64, state, detail string) error {
	_, err := s.sql.ExecContext(ctx, `UPDATE app SET changes = ?, changes_detail = ? WHERE id = ?`, state, detail, id)
	return err
}
