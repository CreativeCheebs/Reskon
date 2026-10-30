package db

import (
	"context"
	"encoding/json"
	"regexp"
)

var viewColumns = columns{
	"name":        kText,
	"layout":      kText,
	"filter":      kJSONObject,
	"card_config": kJSONObject,
	"board_state": kJSONObject,
	"position":    kInt,
	"icon":        kJSONObject,
	"color":       kTextNull,
	"background":  kJSONObject,
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func checkViewFields(f Fields) error {
	if raw, ok := f["filter"]; ok {
		if _, err := parseFilter(raw); err != nil {
			return err
		}
	}
	if s, ok, err := f.stringField("layout"); err != nil {
		return err
	} else if ok && s != "board" && s != "table" {
		return invalid("layout must be board or table")
	}
	if raw, ok := f["color"]; ok && !isNull(raw) {
		var c string
		if json.Unmarshal(raw, &c) != nil || (c != "" && !hexColor.MatchString(c)) {
			return invalid("color must be #rrggbb")
		}
	}
	if raw, ok := f["icon"]; ok && len(raw) > 16<<10 {
		return invalid("icon is too large")
	}
	return nil
}

func (d *DB) CreateView(ctx context.Context, f Fields) (*View, error) {
	if err := checkViewFields(f); err != nil {
		return nil, err
	}
	if _, ok := f["filter"]; !ok {
		f["filter"] = json.RawMessage(`{}`)
	}
	id, err := d.insertRow(ctx, "view", f, viewColumns)
	if err != nil {
		return nil, err
	}
	return d.GetView(ctx, id)
}

// PatchView updates one view. Card configuration is per view, so changing it
// here affects no other view.
func (d *DB) PatchView(ctx context.Context, id int64, f Fields) (*View, error) {
	if err := checkViewFields(f); err != nil {
		return nil, err
	}
	if err := d.patchRow(ctx, "view", id, f, viewColumns); err != nil {
		return nil, err
	}
	if _, ok := f["background"]; ok {
		if err := d.pruneImages(ctx); err != nil {
			return nil, err
		}
	}
	return d.GetView(ctx, id)
}

func (d *DB) DeleteView(ctx context.Context, id int64) error {
	if err := d.softDelete(ctx, "view", id); err != nil {
		return err
	}
	return d.pruneImages(ctx)
}
