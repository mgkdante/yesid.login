-- Who changed what. Names and contact details stay in the user table; commits carry only the ID.
CREATE TABLE edit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  editor_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  paths TEXT NOT NULL,
  commit_oid TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX edit_log_created_at ON edit_log (created_at);
