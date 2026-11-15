package live

import "testing"

func TestPublishReachesOnlyThatPerson(t *testing.T) {
	h := New()
	a, stopA, _ := h.Subscribe(1)
	defer stopA()
	b, stopB, _ := h.Subscribe(2)
	defer stopB()

	h.Publish(1, Event{Topic: "tasks", Tab: "x"})
	select {
	case e := <-a:
		if e.Topic != "tasks" || e.Tab != "x" {
			t.Fatalf("got %+v", e)
		}
	default:
		t.Fatal("person 1 got nothing")
	}
	select {
	case e := <-b:
		t.Fatalf("person 2 got person 1's note %+v", e)
	default:
	}
}

func TestStopRemovesTheTab(t *testing.T) {
	h := New()
	_, stop, _ := h.Subscribe(1)
	if h.Listeners(1) != 1 {
		t.Fatal("not listening")
	}
	stop()
	stop() // twice is harmless
	if h.Listeners(1) != 0 {
		t.Fatal("still listening after stop")
	}
	h.Publish(1, Event{Topic: "tasks"}) // nobody there: no panic
}

func TestFullQueueDropsInsteadOfWaiting(t *testing.T) {
	h := New()
	ch, stop, _ := h.Subscribe(1)
	defer stop()
	for i := 0; i < buffer*3; i++ {
		h.Publish(1, Event{Topic: "tasks"}) // must not block
	}
	if len(ch) != buffer {
		t.Fatalf("queue holds %d, want %d", len(ch), buffer)
	}
}

func TestTabLimitPerPerson(t *testing.T) {
	h := New()
	var stops []func()
	for i := 0; i < MaxPerUser; i++ {
		_, stop, ok := h.Subscribe(1)
		if !ok {
			t.Fatalf("tab %d refused", i)
		}
		stops = append(stops, stop)
	}
	if _, _, ok := h.Subscribe(1); ok {
		t.Fatal("tab over the limit accepted")
	}
	if _, stop, ok := h.Subscribe(2); !ok {
		t.Fatal("another person refused because of person 1's tabs")
	} else {
		stop()
	}
	stops[0]()
	if _, stop, ok := h.Subscribe(1); !ok {
		t.Fatal("refused after a tab closed")
	} else {
		stop()
	}
}
