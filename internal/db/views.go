package db

import (
	"context"
	"encoding/json"
)

var viewColumns = columns{
	"name":        kText,
	"layout":      kText,
	"filter":      kJSONObject,
	"card_config": kJSONObject,
	"board_state": kJSONObject,
	"position":    kInt,
}

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
	return d.GetView(ctx, id)
}

func (d *DB) DeleteView(ctx context.Context, id int64) error {
	return d.softDelete(ctx, "view", id)
}
