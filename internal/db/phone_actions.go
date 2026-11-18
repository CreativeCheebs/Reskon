package db

import "encoding/json"

// phoneActionKeys are the actions a task offers (the same six as the web's card actions).
var phoneActionKeys = map[string]bool{"log": true, "snooze": true, "note": true, "move": true, "open": true, "delete": true}

// MaxPhoneSwipeActions is how many buttons a swiped task row shows besides More.
const MaxPhoneSwipeActions = 3

// checkPhoneCardActions validates the phone-only `phone_card_actions` setting:
// {"swipe": [up to 3 different action keys, in the order shown]}.
func checkPhoneCardActions(value json.RawMessage) error {
	var v struct {
		Swipe []string `json:"swipe"`
	}
	if err := json.Unmarshal(value, &v); err != nil {
		return invalid("phone_card_actions: %v", err)
	}
	if len(v.Swipe) > MaxPhoneSwipeActions {
		return invalid("phone_card_actions: at most %d swipe buttons", MaxPhoneSwipeActions)
	}
	seen := map[string]bool{}
	for _, k := range v.Swipe {
		if !phoneActionKeys[k] {
			return invalid("phone_card_actions: %q is not an action", k)
		}
		if seen[k] {
			return invalid("phone_card_actions: %q is listed twice", k)
		}
		seen[k] = true
	}
	return nil
}
