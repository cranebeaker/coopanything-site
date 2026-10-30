-- Wanted games: every game people can ask for a co-op mod for, keyed by its IGDB id so a game can
-- never be listed twice. Rows come from the research seed (tools/seed_wanted.mjs) or from a member
-- requesting a game on the site (worker/wanted.js).
CREATE TABLE IF NOT EXISTS wanted_games (
  igdb_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  year INTEGER,
  cover TEXT,                 -- IGDB image id
  steam_appid TEXT,
  ratings INTEGER,            -- IGDB rating count, a rough popularity
  coop TEXT NOT NULL DEFAULT 'unchecked',   -- unchecked | none_found | mod_found | official_coop | unsure
  research TEXT,              -- JSON: { projects, sources, searched, checked }
  site_id TEXT,               -- the directory entry on the site, when there is one
  requested_by TEXT,          -- Discord user id, null for seeded games
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wanted_games_coop ON wanted_games (coop);

-- One row per member per game: the primary key is the whole anti-duplicate rule.
CREATE TABLE IF NOT EXISTS wanted_votes (
  igdb_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (igdb_id, user_id)
);
CREATE INDEX IF NOT EXISTS wanted_votes_game ON wanted_votes (igdb_id, created);
CREATE INDEX IF NOT EXISTS wanted_votes_user ON wanted_votes (user_id, created);

-- Short-lived counters for rate limits (search, requests).
CREATE TABLE IF NOT EXISTS rate (
  k TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_k ON rate (k, at);

-- Who may vote: only server members, and only accounts and memberships that are not brand new.
ALTER TABLE sessions ADD COLUMN member INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN joined INTEGER;
