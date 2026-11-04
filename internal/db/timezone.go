package db

import (
	"context"
	"sync"
	"time"
	_ "time/tzdata" // zone data inside the binary, for servers and containers without it
)

// Each person's own time zone decides what "today" is for them: due-date
// days, snoozes, metrics' days. The browser and the phone tell it (the
// time_zone setting, e.g. "Asia/Kolkata") whenever they open; until then
// the server's own zone is used.

var zones sync.Map // name -> *time.Location

// Location is this person's time zone.
func (d *DB) Location(ctx context.Context) *time.Location {
	var name string
	if ok, err := d.Setting(ctx, "time_zone", &name); !ok || err != nil || name == "" {
		return time.Local
	}
	if l, ok := zones.Load(name); ok {
		return l.(*time.Location)
	}
	l, err := time.LoadLocation(name)
	if err != nil {
		return time.Local
	}
	zones.Store(name, l)
	return l
}

// Now is the current time in this person's time zone.
func (d *DB) Now(ctx context.Context) time.Time {
	return time.Now().In(d.Location(ctx))
}
