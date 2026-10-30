-- Mods listed by their own devs. A dev who has been given the Dev role runs /listing add in their
-- Discord topic and the mod shows on the site straight away (no directory edit). When the same mod
-- is later added to the reviewed directory, the site shows the directory entry instead.
CREATE TABLE IF NOT EXISTS community (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  project TEXT NOT NULL,
  url TEXT NOT NULL,
  created INTEGER NOT NULL,
  created_by TEXT,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS community_url ON community (url);
