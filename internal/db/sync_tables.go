package db

// The tables that sync (Change 003), in the order a device applies them,
// so a row's references exist before it does. Anything not listed here
// stays on its device: image (blobs), task_embedding (derived, item 8).

type syncTable struct {
	name string
	// natural is the key column of a table without an integer id
	// (setting, day_plan); "" means the row is keyed by id and has a uid.
	natural string
	// refs maps a column holding another row's id to that row's table.
	refs map[string]string
	// skip lists columns that never sync. task.status_id follows from the
	// transition log instead (item 6).
	skip []string
	// uidSQL makes a new row's uid in the insert trigger; random when "".
	uidSQL string
	// parent names the session field a child table is synced as: its rows
	// travel as one value of their session, last writer wins.
	parent string
}

var syncTables = []syncTable{
	{name: "status_category"},
	{name: "energy_type"},
	{name: "subtype", refs: map[string]string{"energy_type_id": "energy_type"}},
	{name: "priority"},
	{name: "status", refs: map[string]string{"category_id": "status_category"}},
	{name: "area", refs: map[string]string{"default_energy_type_id": "energy_type"}},
	// A custom field's entity and key are its uid, so two devices adding the
	// same field get one record; a key used again after a delete gets a
	// fresh uid, since the old one is a tombstone.
	{name: "custom_field", uidSQL: `CASE WHEN EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'custom_field'
		AND uid = 'cf-' || NEW.entity || '-' || NEW.key) THEN lower(hex(randomblob(16)))
		ELSE 'cf-' || NEW.entity || '-' || NEW.key END`},
	// A tag's name is its uid (lower case), so two devices adding the same tag get one
	// record; a name used again after a delete or a rename gets a fresh uid, since the
	// old one is a tombstone or is still the renamed tag's.
	{name: "tag", uidSQL: `CASE WHEN EXISTS (SELECT 1 FROM sync_idmap WHERE tbl = 'tag'
		AND uid = 'tag-' || lower(NEW.name)) THEN lower(hex(randomblob(16)))
		ELSE 'tag-' || lower(NEW.name) END`},
	{name: "view"},
	{name: "dashboard"},
	{name: "widget", refs: map[string]string{"dashboard_id": "dashboard"}},
	{name: "task", refs: map[string]string{
		"area_id": "area", "status_id": "status", "priority_id": "priority",
		"energy_type_id": "energy_type", "epic_id": "task", "parent_id": "task",
	}, skip: []string{"status_id"}},
	// A task's tag is its uid made of the task's and the tag's, so the same tag added to the
	// same task on two devices is one record, and removing it on one removes it on the other.
	{name: "task_tag", refs: map[string]string{"task_id": "task", "tag_id": "tag"}, uidSQL: `CASE WHEN EXISTS (
		SELECT 1 FROM sync_idmap WHERE tbl = 'task_tag' AND uid = 'tt-'
			|| (SELECT uid FROM sync_idmap WHERE tbl = 'task' AND id = NEW.task_id) || '-'
			|| (SELECT uid FROM sync_idmap WHERE tbl = 'tag' AND id = NEW.tag_id))
		THEN lower(hex(randomblob(16)))
		ELSE 'tt-' || (SELECT uid FROM sync_idmap WHERE tbl = 'task' AND id = NEW.task_id) || '-'
			|| (SELECT uid FROM sync_idmap WHERE tbl = 'tag' AND id = NEW.tag_id) END`},
	{name: "task_link", refs: map[string]string{"blocker_id": "task", "blocked_id": "task"}},
	{name: "status_transition", refs: map[string]string{"task_id": "task", "from_status_id": "status", "to_status_id": "status"}},
	{name: "session", refs: map[string]string{"task_id": "task", "area_id": "area", "energy_type_id": "energy_type"}},
	{name: "session_energy", parent: "_energies"},
	{name: "session_subtype", parent: "_subtypes"},
	{name: "session_tag", parent: "_tags"},
	{name: "state"},
	{name: "inbox_item"},
	{name: "day_plan", natural: "day"},
	{name: "setting", natural: "key"},
}

// Settings that never leave the device. The capture API key waits for
// Change 003 item 17's encryption.
var syncPrivateSettings = map[string]bool{"llm_api_key": true}

func syncTableNamed(name string) *syncTable {
	for i := range syncTables {
		if syncTables[i].name == name {
			return &syncTables[i]
		}
	}
	return nil
}

func (t *syncTable) skips(col string) bool {
	for _, s := range t.skip {
		if s == col {
			return true
		}
	}
	return false
}
