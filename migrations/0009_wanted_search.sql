-- A folded search string per game ("fallout new vegas fnv"): punctuation and accents gone, plus the
-- title's initials, so "fallout nv" and "fnv" find Fallout: New Vegas. Filled by the seed script and
-- by requests (searchKey in worker/wanted.js).
ALTER TABLE wanted_games ADD COLUMN search TEXT;
UPDATE wanted_games SET search = lower(name) WHERE search IS NULL;
