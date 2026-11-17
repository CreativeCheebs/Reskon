package db

import (
	"bytes"
	"encoding/json"
	"strings"
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

// enumSettings are settings that hold one of a few words.
//
//	dashboard_toolbar: where the dashboard's toolbar sits, "top" (the
//	default when missing) or "left".
var enumSettings = map[string][]string{"dashboard_toolbar": {"top", "left"}}

// checkEnumSetting accepts only a JSON string that is one of the words.
func checkEnumSetting(key string, value json.RawMessage) error {
	var v string
	if json.Unmarshal(value, &v) != nil || !contains(enumSettings[key], v) {
		return invalid("%s must be one of %s", key, strings.Join(enumSettings[key], ", "))
	}
	return nil
}
