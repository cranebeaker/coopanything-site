-- What a mod's own devs set from Discord with /listing (the Discord bot posts it to /api/listing).
-- Shown on top of the directory data: the Discord topic link, a stage, the latest version and a note.
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  discord TEXT,
  stage TEXT CHECK (stage IN ('released', 'beta', 'development', 'abandoned')),
  version TEXT,
  version_date TEXT,
  note TEXT,
  note_date TEXT,
  updated INTEGER NOT NULL,
  updated_by TEXT
);
