-- Latest GitHub release of each listed mod, checked on a schedule (worker/releases.js) so new
-- releases show on the site without a redeploy. A dev's own /listing version wins when it's newer.
CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  version TEXT,
  version_date TEXT,
  url TEXT,
  checked INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS releases_checked ON releases (checked);
