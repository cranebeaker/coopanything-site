-- Card details a mod's devs can set: cover image link, their own tier (S stays the owner's call),
-- co-op %, engine and how you connect. Shown on top of the directory data, marked as set by the devs.
ALTER TABLE listings ADD COLUMN cover TEXT;
ALTER TABLE listings ADD COLUMN quality TEXT;
ALTER TABLE listings ADD COLUMN coop_pct INTEGER;
ALTER TABLE listings ADD COLUMN engine TEXT;
ALTER TABLE listings ADD COLUMN connect TEXT;
