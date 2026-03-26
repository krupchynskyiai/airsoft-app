-- Carpool rides for games
-- Required for: /api/games/:id/rides* and admin/cleanup hooks

-- 1) Ride offers (one per owner per game)
CREATE TABLE IF NOT EXISTS game_rides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  owner_player_id INT NOT NULL,

  seats_total INT NOT NULL,
  depart_location VARCHAR(255) NOT NULL,
  depart_time VARCHAR(64) NOT NULL,
  car_make VARCHAR(64) NOT NULL,
  car_color VARCHAR(64) NOT NULL,

  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,

  UNIQUE KEY uniq_game_owner (game_id, owner_player_id),
  KEY idx_game (game_id),
  KEY idx_owner (owner_player_id)
);

-- 2) Seat requests to a ride offer (one request per requester per ride)
CREATE TABLE IF NOT EXISTS game_ride_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ride_id INT NOT NULL,
  game_id INT NOT NULL,
  requester_player_id INT NOT NULL,

  seats_requested INT NOT NULL DEFAULT 1,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,

  UNIQUE KEY uniq_ride_requester (ride_id, requester_player_id),
  KEY idx_ride (ride_id),
  KEY idx_game (game_id),
  KEY idx_requester (requester_player_id),
  KEY idx_status (status)
);

-- Optional: if your MySQL supports foreign keys and you want them, add them manually.
-- (Kept optional to avoid breaking existing deployments with inconsistent data.)
-- ALTER TABLE game_ride_requests
--   ADD CONSTRAINT fk_ride_requests_ride
--   FOREIGN KEY (ride_id) REFERENCES game_rides(id) ON DELETE CASCADE;

