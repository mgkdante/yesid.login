ALTER TABLE membership ADD COLUMN confirmed_at TEXT;
ALTER TABLE membership ADD COLUMN invited_at TEXT;
UPDATE membership SET confirmed_at = created_at;
DROP TRIGGER session_needs_site;
CREATE TRIGGER session_needs_site BEFORE INSERT ON session
WHEN NOT EXISTS (SELECT 1 FROM membership WHERE user_id = NEW.userId
  AND (role IN ('owner','it') OR confirmed_at IS NOT NULL OR invited_at > datetime('now','-7 days')))
BEGIN
  SELECT RAISE(ABORT, 'session_needs_site');
END;
CREATE TRIGGER email_change_sessions AFTER UPDATE OF email ON user
WHEN OLD.email <> NEW.email
BEGIN
  DELETE FROM session WHERE userId = NEW.id;
END;
CREATE TABLE email_change_budget (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL
);
CREATE INDEX email_change_budget_user_time ON email_change_budget(user_id,started_at);
CREATE TRIGGER people_renewal BEFORE UPDATE OF invited_at ON membership
WHEN OLD.role = 'employee' AND OLD.confirmed_at IS NULL AND OLD.invited_at <= datetime('now','-7 days')
BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM people_log WHERE site_slug = NEW.site_slug AND action = 'add'
    AND created_at >= datetime('now','-1 hour')) >= 20 THEN RAISE(ABORT, 'people_rate') END;
END;
CREATE TABLE invitation_notice (
  site_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (site_slug,user_id),
  FOREIGN KEY (site_slug,user_id) REFERENCES membership(site_slug,user_id) ON DELETE CASCADE
);
CREATE TRIGGER confirm_invitations AFTER INSERT ON session
BEGIN
  INSERT OR IGNORE INTO invitation_notice (site_slug,user_id)
    SELECT site_slug,user_id FROM membership WHERE user_id = NEW.userId AND role = 'employee'
      AND confirmed_at IS NULL AND invited_at > datetime('now','-7 days');
  UPDATE membership SET confirmed_at = datetime('now') WHERE user_id = NEW.userId AND role = 'employee'
    AND confirmed_at IS NULL AND invited_at > datetime('now','-7 days');
END;

-- Older Worker inserts omit invitation fields. Keep additions usable during the release window.
CREATE TRIGGER invitation_timestamp AFTER INSERT ON membership
WHEN NEW.invited_at IS NULL AND NEW.confirmed_at IS NULL
BEGIN
  UPDATE membership SET invited_at=datetime('now') WHERE site_slug=NEW.site_slug AND user_id=NEW.user_id;
END;
