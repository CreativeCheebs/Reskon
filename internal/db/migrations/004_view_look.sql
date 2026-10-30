-- Migration 004: how a view looks. Additive only.

-- {"emoji": "🚀"} or {"set": "fluent-regular", "name": "rocket", "svg": "<path .../>"}
-- The SVG body is kept on the view so the sidebar needs no icon library.
ALTER TABLE view ADD COLUMN icon TEXT NOT NULL DEFAULT '{}';
-- #rrggbb, tints the icon. NULL = the theme's text colour.
ALTER TABLE view ADD COLUMN color TEXT;
-- {"image_id": 3, "fit": "cover"|"contain"|"stretch", "opacity": 0-1,
--  "blur": px, "surface_opacity": 0-1}
ALTER TABLE view ADD COLUMN background TEXT NOT NULL DEFAULT '{}';

-- Uploaded images (view backgrounds). Images no view refers to are removed
-- when a view's background changes or a view is deleted.
CREATE TABLE image (
  id         INTEGER PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);
