USE airsoft_db;

CREATE TABLE IF NOT EXISTS game_player_billing (
  id INT NOT NULL AUTO_INCREMENT,
  game_id INT NOT NULL,
  player_id INT NOT NULL,

  extra_weapon_mode ENUM('amount', 'qty_price') NOT NULL DEFAULT 'amount',
  extra_weapon_amount INT NOT NULL DEFAULT 0,
  extra_weapon_qty INT NULL,
  extra_weapon_unit_price INT NULL,

  bb_mode ENUM('amount', 'qty_price') NOT NULL DEFAULT 'amount',
  bb_amount INT NOT NULL DEFAULT 0,
  bb_qty INT NULL,
  bb_unit_price INT NULL,

  grenade_mode ENUM('amount', 'qty_price') NOT NULL DEFAULT 'amount',
  grenade_amount INT NOT NULL DEFAULT 0,
  grenade_qty INT NULL,
  grenade_unit_price INT NULL,

  smoke_mode ENUM('amount', 'qty_price') NOT NULL DEFAULT 'amount',
  smoke_amount INT NOT NULL DEFAULT 0,
  smoke_qty INT NULL,
  smoke_unit_price INT NULL,

  mini_bar_mode ENUM('amount', 'qty_price') NOT NULL DEFAULT 'amount',
  mini_bar_amount INT NOT NULL DEFAULT 0,
  mini_bar_qty INT NULL,
  mini_bar_unit_price INT NULL,

  repair_mode ENUM('amount', 'qty_price') NOT NULL DEFAULT 'amount',
  repair_amount INT NOT NULL DEFAULT 0,
  repair_qty INT NULL,
  repair_unit_price INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_game_player_billing_game_player (game_id, player_id),
  KEY idx_game_player_billing_game (game_id),
  KEY idx_game_player_billing_player (player_id),

  CONSTRAINT fk_game_player_billing_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_billing_player
    FOREIGN KEY (player_id) REFERENCES players(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
