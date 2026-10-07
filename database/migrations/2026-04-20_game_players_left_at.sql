USE airsoft_db;

-- Зберігаємо точний момент виходу гравця з активної гри (soft-kick).
-- Використовується підрахунком очок, щоб коректно визначити, які раунди
-- гравцеві зараховувати (ті, у яких він брав участь на момент виходу).
ALTER TABLE game_players
  ADD COLUMN left_at DATETIME NULL AFTER attendance;
