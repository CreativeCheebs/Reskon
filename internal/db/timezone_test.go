package db

import (
	"context"
	"testing"
)

// "Today" follows the person's own time zone once a client has said it.
func TestNowUsesThePersonsTimeZone(t *testing.T) {
	ctx := context.Background()
	d := openTest(t)
	if err := d.PutSetting(ctx, "time_zone", []byte(`"Pacific/Kiritimati"`)); err != nil {
		t.Fatal(err)
	}
	if got := d.Now(ctx).Location().String(); got != "Pacific/Kiritimati" {
		t.Fatalf("now is in %s", got)
	}
	if err := d.PutSetting(ctx, "time_zone", []byte(`"Not/AZone"`)); err == nil {
		t.Fatal("an unknown zone was accepted")
	}
}
