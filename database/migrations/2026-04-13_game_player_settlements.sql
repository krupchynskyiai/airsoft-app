USE airsoft_db;

CREATE TABLE IF NOT EXISTS game_player_prepayments (
  id INT NOT NULL AUTO_INCREMENT,
  game_id INT NOT NULL,
  player_id INT NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  created_by_player_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_player_prepayment_game_player (game_id, player_id),
  KEY idx_game_player_prepayment_game (game_id),
  KEY idx_game_player_prepayment_player (player_id),
  CONSTRAINT fk_game_player_prepayment_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_prepayment_player
    FOREIGN KEY (player_id) REFERENCES players(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_prepayment_created_by
    FOREIGN KEY (created_by_player_id) REFERENCES players(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_player_payment_events (
  id INT NOT NULL AUTO_INCREMENT,
  game_id INT NOT NULL,
  player_id INT NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  event_type ENUM('payment', 'adjustment') NOT NULL DEFAULT 'payment',
  note VARCHAR(255) NULL,
  created_by_player_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_game_player_payment_event_game (game_id),
  KEY idx_game_player_payment_event_player (player_id),
  CONSTRAINT fk_game_player_payment_event_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_payment_event_player
    FOREIGN KEY (player_id) REFERENCES players(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_player_payment_event_created_by
    FOREIGN KEY (created_by_player_id) REFERENCES players(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
