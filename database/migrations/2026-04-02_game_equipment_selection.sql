USE airsoft_db;

CREATE TABLE IF NOT EXISTS game_equipment_stock (
  id INT NOT NULL AUTO_INCREMENT,
  game_id INT NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  total_qty INT NULL,
  is_disabled TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_equipment_stock_game_item (game_id, item_key),
  KEY idx_game_equipment_stock_game (game_id),
  CONSTRAINT fk_game_equipment_stock_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_player_equipment (
  id INT NOT NULL AUTO_INCREMENT,
  registration_id INT NOT NULL,
  game_id INT NOT NULL,
  player_id INT NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price INT NULL,
  total_price INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_game_player_equipment_game (game_id),
  KEY idx_game_player_equipment_player (player_id),
  KEY idx_game_player_equipment_registration (registration_id),
  UNIQUE KEY uq_game_player_equipment_registration_item (registration_id, item_key),
  CONSTRAINT fk_game_player_equipment_registration
    FOREIGN KEY (registration_id) REFERENCES game_players(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_equipment_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_equipment_player
    FOREIGN KEY (player_id) REFERENCES players(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
