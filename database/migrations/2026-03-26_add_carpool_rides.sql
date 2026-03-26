-- Carpool rides per game
-- Migration date: 2026-03-26

CREATE TABLE IF NOT EXISTS game_rides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id BIGINT UNSIGNED NOT NULL,
  owner_player_id BIGINT UNSIGNED NOT NULL,
  seats_total INT NOT NULL,
  depart_location VARCHAR(255) NOT NULL,
  depart_time VARCHAR(64) NOT NULL,
  car_make VARCHAR(128) NULL,
  car_color VARCHAR(64) NULL,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_rides_game_owner (game_id, owner_player_id),
  KEY idx_game_rides_game (game_id),
  KEY idx_game_rides_owner (owner_player_id),
  KEY idx_game_rides_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_ride_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ride_id BIGINT UNSIGNED NOT NULL,
  game_id BIGINT UNSIGNED NOT NULL,
  requester_player_id BIGINT UNSIGNED NOT NULL,
  seats_requested INT NOT NULL DEFAULT 1,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_ride_requests_ride_requester (ride_id, requester_player_id),
  KEY idx_game_ride_requests_game (game_id),
  KEY idx_game_ride_requests_ride (ride_id),
  KEY idx_game_ride_requests_requester (requester_player_id),
  KEY idx_game_ride_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

