package appstest

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// The pretend plugin's web page widget, "Today's habits" (docs/plugins.md
// section 4): Reskon asks POST /api/reskon/launch for a ticket with its
// token; the page reads the ticket after "#", swaps it at /api/page/session
// for a session it keeps in memory (no cookie), and lists today's habits as
// checkboxes. Ticks are kept in the fake's memory, per day.

// TicketLife is how long a ticket works; SessionLife how long a page stays
// signed in. MaxSessions caps how many are kept at once.
const (
	TicketLife  = 60 * time.Second
	SessionLife = 12 * time.Hour
	MaxSessions = 1000
)

// readBody reads a small JSON body, before any lock is taken, so a slow
// sender cannot hold up the fake. A bad body leaves v as it was.
func readBody(w http.ResponseWriter, r *http.Request, v any) bool {
	return json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(v) == nil
}

// forgetOld drops used-up tickets and sessions. Call with f.mu held.
func (f *Fake) forgetOld() {
	now := f.Now()
	for t, until := range f.tickets {
		if !now.Before(until) {
			delete(f.tickets, t)
		}
	}
	for s, until := range f.sessions {
		if !now.Before(until) {
			delete(f.sessions, s)
		}
	}
	if len(f.sessions) >= MaxSessions {
		f.sessions = map[string]time.Time{} // a test fake: start again rather than track age order
	}
}

// Habits are the pretend tracker's habits, in order.
var Habits = []struct{ Key, Label string }{{"meditate", "Meditate"}, {"walk", "Walk"}, {"read", "Read"}}

func randomString() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func bearer(r *http.Request) string {
	v, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return ""
	}
	return v
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// Done says whether a habit is ticked today (tests use it).
func (f *Fake) Done(key string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.done[f.today()][key]
}

func (f *Fake) today() string { return f.Now().Format("2006-01-02") }

// todayList is today's habits for the page. Call with f.mu held.
func (f *Fake) todayList() map[string]any {
	day := f.today()
	list := []map[string]any{}
	for _, h := range Habits {
		list = append(list, map[string]any{"key": h.Key, "label": h.Label, "done": f.done[day][h.Key]})
	}
	return map[string]any{"day": day, "habits": list}
}

// tick saves one habit's tick for today. Call with f.mu held.
func (f *Fake) tick(w http.ResponseWriter, key string, done, bodyOK bool) {
	known := false
	for _, h := range Habits {
		known = known || h.Key == key
	}
	if !known || !bodyOK {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no such habit"})
		return
	}
	day := f.today()
	if f.done[day] == nil {
		f.done[day] = map[string]bool{}
	}
	f.done[day][key] = done
	writeJSON(w, http.StatusOK, f.todayList())
}

func (f *Fake) pageRoutes(mux *http.ServeMux) {
	// Reskon's server asks for a ticket with its token (never the browser).
	mux.HandleFunc("POST /api/reskon/launch", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Widget string }
		readBody(w, r, &body)
		f.mu.Lock()
		defer f.mu.Unlock()
		if bearer(r) != f.Token {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "secret detail that must not be shown"})
			return
		}
		f.forgetOld()
		if body.Widget != "today" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no such page"})
			return
		}
		f.Launches++
		t := randomString()
		f.tickets[t] = f.Now().Add(TicketLife)
		writeJSON(w, http.StatusOK, map[string]any{"ticket": t, "expires_in": int(TicketLife.Seconds())})
	})
	// The page swaps a ticket for a session, once.
	mux.HandleFunc("POST /api/page/session", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Ticket string }
		readBody(w, r, &body)
		f.mu.Lock()
		defer f.mu.Unlock()
		until, ok := f.tickets[body.Ticket]
		delete(f.tickets, body.Ticket)
		if !ok || !f.Now().Before(until) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "this ticket is used up or too old"})
			return
		}
		f.forgetOld()
		s := randomString()
		f.sessions[s] = f.Now().Add(SessionLife)
		writeJSON(w, http.StatusOK, map[string]string{"session": s})
	})
	// signedIn runs h with f.mu held, for a page with a live session. body,
	// if any, is read first, outside the lock.
	signedIn := func(body any, h func(w http.ResponseWriter, r *http.Request, bodyOK bool)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ok := body == nil || readBody(w, r, body)
			f.mu.Lock()
			defer f.mu.Unlock()
			if until, in := f.sessions[bearer(r)]; !in || !f.Now().Before(until) {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not signed in"})
				return
			}
			h(w, r, ok)
		}
	}
	mux.HandleFunc("GET /api/page/today", signedIn(nil, func(w http.ResponseWriter, r *http.Request, _ bool) {
		writeJSON(w, http.StatusOK, f.todayList())
	}))
	mux.HandleFunc("POST /api/page/today/{key}", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Done bool }
		signedIn(&body, func(w http.ResponseWriter, r *http.Request, bodyOK bool) {
			f.tick(w, r.PathValue("key"), body.Done, bodyOK)
		})(w, r)
	})
	mux.HandleFunc("GET /widgets/today", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		origin := f.ReskonOrigin
		f.mu.Unlock()
		ancestors := "'none'"
		if origin != "" {
			ancestors = origin
		}
		h := w.Header()
		h.Set("Content-Security-Policy", "frame-ancestors "+ancestors)
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		// json.Marshal escapes <, > and &, so the origin cannot end the script.
		o, _ := json.Marshal(origin)
		_, _ = w.Write([]byte(strings.Replace(todayPage, "__RESKON__", string(o), 1)))
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html><meta charset="utf-8"><title>Habits</title><h1>Habits (pretend plugin)</h1><p>A test app for Reskon. Its widget is at <a href="widgets/today">widgets/today</a>.</p>`))
	})
}

// todayPage is the widget page. It reads the ticket and theme after "#",
// removes them from the address, signs in and lists today's habits. It acts
// on messages only from Reskon's own address.
const todayPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Today's habits</title>
<style>
:root { --bg: transparent; --surface: #2a2a30; --text: #eeeeee; --muted: #b0b0b0; --accent: #8fa2ff; --border: #46464e; --font: system-ui, sans-serif; --radius: 6px; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 14px var(--font); }
main { box-sizing: border-box; height: 100%; overflow: auto; padding: 4px 2px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
label { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
input { width: 18px; height: 18px; accent-color: var(--accent); margin: 0; }
#msg { color: var(--muted); margin: 0 0 8px; font-size: 13px; }
#msg:empty { display: none; }
</style></head>
<body><main>
<p id="msg" role="status">Signing in…</p>
<ul id="list" aria-label="Today's habits"></ul>
</main>
<script>
(function () {
  var RESKON = __RESKON__;
  var session = null;
  var msg = document.getElementById("msg");
  var list = document.getElementById("list");
  var params = new URLSearchParams(location.hash.slice(1));
  var ticket = params.get("ticket");
  // The ticket works once: take it out of the address straight away.
  history.replaceState(null, "", location.pathname + location.search);

  function applyTheme(t) {
    if (!t || typeof t !== "object") return;
    var vars = { bg: "--bg", surface: "--surface", text: "--text", muted: "--muted", accent: "--accent", border: "--border", font: "--font" };
    for (var k in vars) if (typeof t[k] === "string") document.documentElement.style.setProperty(vars[k], t[k]);
    if (typeof t.radius === "number") document.documentElement.style.setProperty("--radius", t.radius + "px");
  }
  try { applyTheme(JSON.parse(params.get("theme") || "null")); } catch (e) {}

  function call(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session || "") },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function show(data) {
    msg.textContent = "";
    list.textContent = "";
    data.habits.forEach(function (h) {
      var li = document.createElement("li");
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = h.done;
      box.addEventListener("change", function () {
        box.disabled = true;
        call("POST", "../api/page/today/" + encodeURIComponent(h.key), { done: box.checked }).then(function (d) {
          show(d);
          if (RESKON) window.parent.postMessage({ reskon: 1, type: "changed" }, RESKON);
        }, function () {
          msg.textContent = "Could not save that tick.";
          box.checked = !box.checked;
          box.disabled = false;
        });
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(h.label));
      li.appendChild(label);
      list.appendChild(li);
    });
  }
  function load() {
    return call("GET", "../api/page/today").then(show, function () { msg.textContent = "Could not load today's habits."; });
  }
  window.addEventListener("message", function (e) {
    if (!RESKON || e.origin !== RESKON || !e.data || e.data.reskon !== 1) return;
    if (e.data.type === "theme") applyTheme(e.data.theme);
    if (e.data.type === "refresh" && session) load();
  });

  if (!ticket) {
    msg.textContent = "Open this page from a Reskon dashboard.";
    return;
  }
  fetch("../api/page/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: ticket }) })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { session = d.session; return load(); }, function () {
      msg.textContent = "This sign-in link is used up or too old. Press Refresh on the widget.";
    });
})();
</script>
</body></html>
`
