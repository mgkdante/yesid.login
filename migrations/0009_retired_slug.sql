-- A slug is never given to a second site: logs and edit history stay unambiguous after a client leaves.
CREATE TABLE retired_slug (
  slug TEXT PRIMARY KEY NOT NULL,
  retired_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER site_retires_slug AFTER DELETE ON site
BEGIN
  INSERT OR IGNORE INTO retired_slug (slug) VALUES (OLD.slug);
END;
CREATE TRIGGER site_slug_not_retired BEFORE INSERT ON site
WHEN EXISTS (SELECT 1 FROM retired_slug WHERE slug = NEW.slug)
BEGIN
  SELECT RAISE(ABORT, 'slug_retired');
END;
