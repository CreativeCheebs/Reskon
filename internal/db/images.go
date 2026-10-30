package db

import (
	"context"
	"database/sql"
	"time"
)

// Images uploaded for view backgrounds. Stored in the person's own
// database, so backups carry them and nobody else can read them.

// MaxImageBytes caps one upload.
const MaxImageBytes = 8 << 20

// ImageTypes are the formats accepted, by sniffed MIME type. No SVG: it can
// carry script.
var ImageTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true}

type Image struct {
	ID   int64  `json:"id"`
	Mime string `json:"mime"`
	Data []byte `json:"-"`
}

func (d *DB) CreateImage(ctx context.Context, mime string, data []byte) (*Image, error) {
	if !ImageTypes[mime] {
		return nil, invalid("image must be PNG, JPEG, GIF or WebP")
	}
	if len(data) == 0 || len(data) > MaxImageBytes {
		return nil, invalid("image must be at most %d MB", MaxImageBytes>>20)
	}
	res, err := d.ExecContext(ctx, `INSERT INTO image (mime, data, created_at) VALUES (?, ?, ?)`, mime, data, Now())
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	return &Image{ID: id, Mime: mime}, err
}

func (d *DB) GetImage(ctx context.Context, id int64) (*Image, error) {
	img := Image{ID: id}
	err := d.QueryRowContext(ctx, `SELECT mime, data FROM image WHERE id = ?`, id).Scan(&img.Mime, &img.Data)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &img, err
}

// pruneImages removes images no live view uses, keeping any uploaded in the
// last hour: the view settings upload first and save the view after.
func (d *DB) pruneImages(ctx context.Context) error {
	_, err := d.ExecContext(ctx, `DELETE FROM image
		WHERE created_at < ?
		  AND id NOT IN (SELECT json_extract(background, '$.image_id') FROM view
		                 WHERE deleted_at IS NULL AND json_extract(background, '$.image_id') IS NOT NULL)`,
		FormatTime(time.Now().Add(-time.Hour)))
	return err
}
