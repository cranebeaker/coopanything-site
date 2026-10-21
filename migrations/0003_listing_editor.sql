-- More of a mod's listing that its devs can set, from Discord (/listing) or the site's editor
-- (after logging in with Discord), plus the Dev role that's allowed to edit it.
ALTER TABLE listings ADD COLUMN summary TEXT;      -- markdown, up to 4000 characters
ALTER TABLE listings ADD COLUMN video TEXT;        -- a YouTube, Vimeo or Streamable link (embedded, never hosted)
ALTER TABLE listings ADD COLUMN website TEXT;
ALTER TABLE listings ADD COLUMN download TEXT;
ALTER TABLE listings ADD COLUMN players TEXT;
ALTER TABLE listings ADD COLUMN sync TEXT;         -- JSON: { story, enemies, world, items } each yes | partial | no
ALTER TABLE listings ADD COLUMN dev_role TEXT;     -- Discord role id whose members may edit this listing

-- Logins with Discord. A session is a random id in an HttpOnly cookie; roles are read at login.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  roles TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires);
