-- Sites and memberships. In production this migration also linked the first client's existing
-- accounts and logs; those rows live only in the production database. New clients are added
-- with scripts/new-client.ts, never in a migration.
CREATE TABLE site (
  slug TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  label TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE membership (
  site_slug TEXT NOT NULL REFERENCES site(slug) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'employee', 'it')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (site_slug, user_id)
);
CREATE INDEX membership_user ON membership(user_id);
ALTER TABLE edit_log ADD COLUMN site_slug TEXT REFERENCES site(slug);
