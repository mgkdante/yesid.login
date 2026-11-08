CREATE TABLE people_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_slug TEXT NOT NULL REFERENCES site(slug),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add', 'remove')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX people_log_site_time ON people_log(site_slug, action, created_at);
-- A session needs a site, including for a sign-in already in progress when someone's last membership is removed.
CREATE TRIGGER session_needs_site BEFORE INSERT ON session
WHEN NOT EXISTS (SELECT 1 FROM membership WHERE user_id = NEW.userId)
BEGIN
  SELECT RAISE(ABORT, 'session_needs_site');
END;
CREATE TRIGGER people_capacity BEFORE INSERT ON membership
WHEN NOT EXISTS (SELECT 1 FROM membership WHERE site_slug = NEW.site_slug AND user_id = NEW.user_id)
BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM membership WHERE site_slug = NEW.site_slug) >= 25
    THEN RAISE(ABORT, 'people_capacity') END;
  SELECT CASE WHEN (SELECT count(*) FROM people_log WHERE site_slug = NEW.site_slug AND action = 'add'
    AND created_at >= datetime('now', '-1 hour')) >= 20 THEN RAISE(ABORT, 'people_rate') END;
END;
