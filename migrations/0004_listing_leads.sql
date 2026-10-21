-- A listing's leads (Discord user ids, JSON array), sent by the bot from the topic's "Lead:" line.
-- Leads (and the server owner) may edit the listing on the site; assistants only have the Dev role.
ALTER TABLE listings ADD COLUMN leads TEXT;
