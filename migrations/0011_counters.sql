-- Counters instead of counting rows on every request. D1's free tier allows 5 million row reads a day,
-- and counting rows that grow with traffic (visits) or with votes is what used it up.

-- Visits per project per day. /api/hit adds one; the Trending numbers read a few hundred rows at most,
-- however many visitors there are. (The old hits table is no longer written.)
CREATE TABLE IF NOT EXISTS visit_counts (
  id TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id, day)
);
CREATE INDEX IF NOT EXISTS visit_counts_day ON visit_counts (day);
INSERT OR IGNORE INTO visit_counts (id, day, n) SELECT id, day, COUNT(*) FROM hits GROUP BY id, day;

-- Wanted votes per game, kept in step by /api/wanted/vote and /request. The partial index means the
-- home page's vote counts read only the games that have votes.
ALTER TABLE wanted_games ADD COLUMN votes INTEGER NOT NULL DEFAULT 0;
UPDATE wanted_games SET votes = (SELECT COUNT(*) FROM wanted_votes v WHERE v.igdb_id = wanted_games.igdb_id);
CREATE INDEX IF NOT EXISTS wanted_games_voted ON wanted_games (votes) WHERE votes > 0;
