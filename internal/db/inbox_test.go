package db

import (
	"context"
	"testing"
)

func TestInbox(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	if _, err := d.AddInbox(ctx, "   "); err == nil {
		t.Error("blank line accepted")
	}
	a, err := d.AddInbox(ctx, "  call the plumber ")
	if err != nil || a.Text != "call the plumber" {
		t.Fatalf("add = %+v, %v", a, err)
	}
	b, _ := d.AddInbox(ctx, "gym 1h")
	c, _ := d.AddInbox(ctx, "never mind")
	if err := d.TriageInbox(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.DiscardInbox(ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.DiscardInbox(ctx, c.ID); err != ErrNotFound {
		t.Errorf("discarding twice = %v, want not found", err)
	}
	items, err := d.ListInbox(ctx)
	if err != nil || len(items) != 1 || items[0].ID != a.ID {
		t.Errorf("inbox = %+v, %v; want only the first line", items, err)
	}
}
