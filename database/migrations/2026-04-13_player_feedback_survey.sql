USE airsoft_db;

CREATE TABLE IF NOT EXISTS player_feedback_surveys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id INT NOT NULL,
  survey_key VARCHAR(64) NOT NULL,
  overall_experience VARCHAR(32) NOT NULL,
  likes_json TEXT NOT NULL,
  pain_points TEXT NULL,
  improvements_json TEXT NOT NULL,
  app_helpfulness VARCHAR(32) NOT NULL,
  missing_feature TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_player_feedback_survey_player_key (player_id, survey_key),
  KEY idx_player_feedback_survey_created_at (created_at),
  CONSTRAINT fk_player_feedback_survey_player
    FOREIGN KEY (player_id) REFERENCES players(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
