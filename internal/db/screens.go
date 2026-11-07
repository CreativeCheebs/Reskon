package db

import (
	"bytes"
	"encoding/json"
)

// Settings that are a plain yes or no, by key. A missing key means no.
//
//	show_day_screen: the Day screen has a place in the web sidebar and in the
//	phone's tabs. One setting on the account, so the web and the phone agree.
var boolSettings = map[string]bool{"show_day_screen": true}

// checkBoolSetting accepts only the JSON values true and false. (A JSON null
// would decode into a bool without complaint, so it is compared as text.)
func checkBoolSetting(key string, value json.RawMessage) error {
	if v := string(bytes.TrimSpace(value)); v != "true" && v != "false" {
		return invalid("%s must be true or false", key)
	}
	return nil
}
