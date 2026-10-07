USE airsoft_test_db;

-- Bind a loot reward usage request to a specific game so the settlement
-- for that game can apply any discount-style bonuses (free game,
-- discount_50, discount_20, ...) the player claimed.
ALTER TABLE player_loot_rewards
  ADD COLUMN game_id INT NULL AFTER player_id,
  ADD KEY idx_player_loot_rewards_game (game_id),
  ADD CONSTRAINT fk_player_loot_rewards_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE SET NULL;
