-- /api/wanted/all asks only for games members requested. With this index that reads just those rows,
-- not all ~2000 seeded ones (D1's free tier limits row reads per day).
CREATE INDEX IF NOT EXISTS wanted_games_requested ON wanted_games (requested_by) WHERE requested_by IS NOT NULL;
