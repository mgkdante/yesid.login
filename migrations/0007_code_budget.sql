-- Code requests per address, as a keyed hash rather than the address. The daily cleanup deletes rows after one day.
CREATE TABLE code_budget (
  key TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE INDEX code_budget_key_time ON code_budget(key, started_at);
