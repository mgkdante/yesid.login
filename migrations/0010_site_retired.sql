-- A site with history cannot be deleted (its logs reference it), so a departing client's site is retired in place:
-- access ends at once, the logs stay attributed for retention, and the daily cleanup deletes the row once they are gone.
ALTER TABLE site ADD COLUMN retired_at TEXT;
CREATE TRIGGER site_retire_ends_access AFTER UPDATE OF retired_at ON site
WHEN OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL
BEGIN
  DELETE FROM session WHERE site_slug = NEW.slug;
  DELETE FROM membership WHERE site_slug = NEW.slug;
END;
CREATE TRIGGER site_stays_retired BEFORE UPDATE OF retired_at ON site
WHEN OLD.retired_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'site_retired');
END;
CREATE TRIGGER membership_needs_live_site BEFORE INSERT ON membership
WHEN EXISTS (SELECT 1 FROM site WHERE slug = NEW.site_slug AND retired_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'site_retired');
END;
