package db

import (
	"context"
	"encoding/json"
	"testing"
)

func TestPhoneCardActionsSetting(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	good := []string{
		`{"swipe":["snooze","log","move"]}`,
		`{"swipe":[]}`,
		`{"swipe":["delete"]}`,
		`{}`,
	}
	for _, v := range good {
		if err := d.PutSetting(ctx, "phone_card_actions", json.RawMessage(v)); err != nil {
			t.Errorf("%s: unexpected error %v", v, err)
		}
	}
	bad := []string{
		`{"swipe":["snooze","log","move","open"]}`, // more than 3
		`{"swipe":["snooze","snooze"]}`,            // twice
		`{"swipe":["fly"]}`,                        // not an action
		`{"swipe":"snooze"}`,                       // not a list
		`[1]`,
	}
	for _, v := range bad {
		if err := d.PutSetting(ctx, "phone_card_actions", json.RawMessage(v)); err == nil {
			t.Errorf("%s: expected an error", v)
		}
	}
}
