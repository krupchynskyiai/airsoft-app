-- Опція гри: нарахування рейтингу лише за підсумком раундів (перемога команди / нічия),
-- без обліку смертей і без бонусів за виживання в раундах.
ALTER TABLE games
  ADD COLUMN score_round_outcomes_only TINYINT(1) NOT NULL DEFAULT 0
  AFTER duration;
