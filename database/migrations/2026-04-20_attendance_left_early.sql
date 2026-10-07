USE airsoft_test_db;

-- Allow marking a checked-in player who left the game early without
-- removing them from the game_players table. They still owe the organizer
-- for the slot + any extras/equipment that were already charged to them.
ALTER TABLE game_players
  MODIFY COLUMN attendance ENUM(
    'registered',
    'checkin_pending',
    'checked_in',
    'left_early',
    'no_show'
  ) NOT NULL DEFAULT 'registered';
