USE airsoft_db;

SET @has_callsign := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'players'
    AND COLUMN_NAME = 'callsign'
);

SET @sql := IF(
  @has_callsign = 0,
  'ALTER TABLE players ADD COLUMN callsign VARCHAR(24) NULL AFTER nickname',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

