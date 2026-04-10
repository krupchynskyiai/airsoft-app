USE airsoft_db;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS callsign VARCHAR(24) NULL AFTER nickname;

