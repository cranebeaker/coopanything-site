-- Community votes: one row per project per voter (a salted hash, never an address).
CREATE TABLE IF NOT EXISTS votes (
  id TEXT NOT NULL,
  voter TEXT NOT NULL,
  iph TEXT NOT NULL,
  pct INTEGER CHECK (pct BETWEEN 0 AND 100),
  score INTEGER CHECK (score BETWEEN 1 AND 10),
  outcome TEXT CHECK (outcome IN ('finished', 'mostly', 'broke', 'no-start')),
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (id, voter)
);
CREATE INDEX IF NOT EXISTS votes_iph_updated ON votes (iph, updated);

-- Visitors per project per day, for Trending. Rows older than a week are deleted.
CREATE TABLE IF NOT EXISTS hits (
  id TEXT NOT NULL,
  day TEXT NOT NULL,
  voter TEXT NOT NULL,
  PRIMARY KEY (id, day, voter)
);
CREATE INDEX IF NOT EXISTS hits_day ON hits (day);

CREATE TABLE IF NOT EXISTS config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
