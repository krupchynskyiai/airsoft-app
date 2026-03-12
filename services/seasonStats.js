const { q1, ins } = require("../database/helpers");
const log = require("../utils/logger");

async function updateSeasonStats(playerId, seasonId, isWinner, playerKills, playerDeaths, pts) {
  const ex = await q1(
    "SELECT * FROM season_stats WHERE player_id=? AND season_id=?",
    [playerId, seasonId]
  );

  if (ex) {
    await ins(
      "UPDATE season_stats SET season_games=season_games+1, season_wins=season_wins+?, season_kills=season_kills+?, season_deaths=season_deaths+?, season_rating=season_rating+? WHERE id=?",
      [isWinner ? 1 : 0, playerKills, playerDeaths, pts, ex.id]
    );
    log.info("Season stats updated", { playerId, seasonId });
  } else {
    await ins(
      "INSERT INTO season_stats (player_id,season_id,season_games,season_wins,season_kills,season_deaths,season_rating) VALUES (?,?,1,?,?,?,?)",
      [playerId, seasonId, isWinner ? 1 : 0, playerKills, playerDeaths, pts]
    );
    log.info("Season stats created", { playerId, seasonId });
  }
}

module.exports = { updateSeasonStats };