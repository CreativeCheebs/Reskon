package db

import (
	"context"
	"encoding/json"
	"testing"
)

// A view keeps its icon, colour and background; the colour must be
// #rrggbb; an image survives while a view uses it and goes once none does.
func TestViewLookAndImagePruning(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	png := []byte("\x89PNG\r\n\x1a\n0000")
	img, err := d.CreateImage(ctx, "image/png", png)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.CreateImage(ctx, "image/svg+xml", []byte("<svg/>")); err == nil {
		t.Fatal("SVG upload was accepted")
	}
	views, _ := d.ListViews(ctx)
	id := views[0].ID

	bg := json.RawMessage(`{"image_id":` + itoa(img.ID) + `,"fit":"cover","opacity":0.5,"blur":4,"surface_opacity":0.8}`)
	v, err := d.PatchView(ctx, id, Fields{
		"icon":       json.RawMessage(`{"emoji":"🚀"}`),
		"color":      json.RawMessage(`"#42A5F5"`),
		"background": bg,
	})
	if err != nil {
		t.Fatal(err)
	}
	if v.Color == nil || *v.Color != "#42A5F5" || string(v.Icon) != `{"emoji":"🚀"}` {
		t.Fatalf("look not kept: %+v", v)
	}
	if _, err := d.PatchView(ctx, id, Fields{"color": json.RawMessage(`"red"`)}); err == nil {
		t.Fatal("colour name accepted")
	}

	// Past the grace hour, an image in use stays and an unused one goes.
	d.Exec(`UPDATE image SET created_at = '2000-01-01T00:00:00Z'`)
	if _, err := d.PatchView(ctx, id, Fields{"background": bg}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.GetImage(ctx, img.ID); err != nil {
		t.Fatalf("image in use was removed: %v", err)
	}
	if _, err := d.PatchView(ctx, id, Fields{"background": json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.GetImage(ctx, img.ID); err != ErrNotFound {
		t.Fatalf("unused image kept: %v", err)
	}
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }
