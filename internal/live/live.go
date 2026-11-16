// Package live tells each person's open tabs that their data changed, so a
// screen can reload without the person pressing refresh. It carries only a
// short "what kind of thing changed" note, never the data itself: the tab
// reloads through the normal API, which keeps every rule in one place.
package live

import "sync"

// Event is one note: which part changed, and which tab made the change
// (that tab already shows it and ignores its own notes).
type Event struct {
	Topic string `json:"topic"`
	Tab   string `json:"tab,omitempty"`
	// App names the connected app whose data changed (topic TopicAppData),
	// for example "habits": a name, never the data.
	App string `json:"app,omitempty"`
}

// TopicAppData is a connected app saying its data changed: only that app's
// data widgets fetch again, nothing else reloads (docs/plugins.md section 7).
const TopicAppData = "app_data"

// MaxPerUser caps how many tabs one person can hold open at once, so a
// buggy or hostile client cannot pile up connections.
const MaxPerUser = 32

// buffer is how many notes wait for a slow tab. Every note means "reload",
// so when it is full the tab has a reload coming anyway and more notes are
// dropped, never queued without limit.
const buffer = 8

type sub struct{ ch chan Event }

// Hub holds who is listening. The zero value is not usable; use New.
type Hub struct {
	mu   sync.Mutex
	subs map[int64]map[*sub]struct{}
}

func New() *Hub { return &Hub{subs: map[int64]map[*sub]struct{}{}} }

// Subscribe starts listening for one person. ok is false when they already
// have MaxPerUser tabs listening. stop must be called when the tab goes.
func (h *Hub) Subscribe(user int64) (events <-chan Event, stop func(), ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.subs[user]
	if len(set) >= MaxPerUser {
		return nil, func() {}, false
	}
	if set == nil {
		set = map[*sub]struct{}{}
		h.subs[user] = set
	}
	s := &sub{ch: make(chan Event, buffer)}
	set[s] = struct{}{}
	var once sync.Once
	return s.ch, func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			delete(h.subs[user], s)
			if len(h.subs[user]) == 0 {
				delete(h.subs, user)
			}
		})
	}, true
}

// Publish sends e to every tab of one person and never waits: a tab whose
// queue is full already has a reload coming.
func (h *Hub) Publish(user int64, e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for s := range h.subs[user] {
		select {
		case s.ch <- e:
		default:
		}
	}
}

// Listeners is how many tabs one person has listening (for tests).
func (h *Hub) Listeners(user int64) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs[user])
}
