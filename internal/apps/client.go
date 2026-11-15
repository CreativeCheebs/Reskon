package apps

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Limits on every call to an app (docs/plugins.md section 6.1).
const (
	Timeout  = 5 * time.Second
	MaxReply = 1 << 20 // 1 MB
)

// Client calls apps. The address is one a person typed, so it is treated as
// capture treats its model address: no redirects (another way to reach
// somewhere else), a time and size limit, and the app's own error text is
// never passed back, only its status code.
type Client struct {
	HTTP *http.Client
}

func (c *Client) http() *http.Client {
	// No proxy from the environment: an app's password and token go to the
	// app and nowhere else.
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	h := http.Client{Transport: t}
	if c != nil && c.HTTP != nil {
		h = *c.HTTP
	}
	h.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &h
}

// Unreachable means the app did not answer usefully. Its message is safe
// to show: it names the address and the status, never the app's reply.
// Status is the app's HTTP status, if it answered at all.
type Unreachable struct {
	Msg    string
	Status int
}

func (e *Unreachable) Error() string { return e.Msg }

// ErrSignIn is a 401 from the app: wrong password, or a token it no longer accepts.
var ErrSignIn = errors.New("the app refused the sign-in")

// do sends one request and returns the reply body of a 200.
func (c *Client) do(ctx context.Context, method, url, token string, body any) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, r)
	if err != nil {
		return nil, &Unreachable{Msg: fmt.Sprintf("%s is not an address Reskon can call", url)}
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := c.http().Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, &Unreachable{Msg: fmt.Sprintf("no answer from %s within %d seconds", url, int(Timeout.Seconds()))}
		}
		return nil, &Unreachable{Msg: fmt.Sprintf("could not reach %s", url)}
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized {
		return nil, ErrSignIn
	}
	if res.StatusCode >= 300 && res.StatusCode < 400 {
		return nil, &Unreachable{Msg: fmt.Sprintf("%s answered with a redirect (HTTP %d); use the address it points to", url, res.StatusCode)}
	}
	if res.StatusCode != http.StatusOK {
		return nil, &Unreachable{Msg: fmt.Sprintf("%s answered HTTP %d", url, res.StatusCode), Status: res.StatusCode}
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, MaxReply+1))
	if err != nil {
		return nil, &Unreachable{Msg: fmt.Sprintf("the answer from %s was cut off", url)}
	}
	if len(data) > MaxReply {
		return nil, &Unreachable{Msg: fmt.Sprintf("the answer from %s is larger than 1 MB", url)}
	}
	return data, nil
}

// Describe reads and checks the description file of the app at base (a
// normalized address).
func (c *Client) Describe(ctx context.Context, base string) (*Manifest, error) {
	url := strings.TrimRight(base, "/") + ManifestPath
	data, err := c.do(ctx, http.MethodGet, url, "", nil)
	if errors.Is(err, ErrSignIn) {
		return nil, &Unreachable{Msg: url + " answered HTTP 401: the description file must be readable without signing in"}
	}
	if err != nil {
		var u *Unreachable
		if errors.As(err, &u) && strings.Contains(u.Msg, "HTTP 404") {
			return nil, &Unreachable{Msg: u.Msg + ": is this a Reskon plugin? Its description file is missing"}
		}
		return nil, err
	}
	return ParseManifest(base, data)
}

// Login swaps a username and password for a token at the app's login
// address. The password is not kept anywhere.
func (c *Client) Login(ctx context.Context, base string, m *Manifest, username, password string) (string, error) {
	url, err := Resolve(base, m.Auth.LoginURL)
	if err != nil {
		return "", err
	}
	data, err := c.do(ctx, http.MethodPost, url, "", map[string]string{"username": username, "password": password})
	if errors.Is(err, ErrSignIn) {
		return "", invalid("%s says the username or password is wrong", m.Name)
	}
	if err != nil {
		return "", err
	}
	var out struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(data, &out) != nil || strings.TrimSpace(out.Token) == "" {
		return "", invalid("%s signed in but sent no token back", m.Name)
	}
	if len(out.Token) > 4096 {
		return "", invalid("%s sent a token longer than 4096 characters", m.Name)
	}
	return out.Token, nil
}
