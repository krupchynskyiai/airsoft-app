const API_BASE = "/api";

function getInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

async function api(path, options = {}) {
  const { method = "GET", body } = options;

  const headers = {
    "Content-Type": "application/json",
    "x-telegram-init-data": getInitData(),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "API error");
  }

  return data;
}

// ---- Player ----
export const getProfile = () => api("/profile");
export const registerPlayer = (nickname, team_id) =>
  api("/register", { method: "POST", body: { nickname, team_id } });
export const getTeamsList = () => api("/teams/list");
export const searchPlayers = (query) => api(`/search-players?q=${encodeURIComponent(query)}`);
export const getFriends = () => api("/friends");
export const sendFriendRequest = (nickname) =>
  api("/friends/request", { method: "POST", body: { nickname } });
export const respondFriendRequest = (requestId, action) =>
  api(`/friends/${requestId}/respond`, {
    method: "POST",
    body: { action },
  });

// ---- Teams ----
export const getGames = (status) =>
  api(`/games${status ? `?status=${status}` : ""}`);
export const getGameDetail = (id) => api(`/games/${id}`);
export const joinGame = (id, payload = {}) =>
  api(`/games/${id}/join`, { method: "POST", body: payload });
export const cancelJoinGame = (id) =>
  api(`/games/${id}/cancel`, { method: "POST" });
export const checkinGame = (id) =>
  api(`/games/${id}/checkin`, { method: "POST" });
export const reportDead = (id) =>
  api(`/games/${id}/imdead`, { method: "POST" });
export const getRoundStatus = (id) => api(`/games/${id}/round`);
export const getMvpState = (id) => api(`/games/${id}/mvp-state`);
export const voteMvp = (id, roundId, targetPlayerId) =>
  api(`/games/${id}/mvp-vote`, {
    method: "POST",
    body: { round_id: roundId, target_player_id: targetPlayerId },
  });

// ---- Rides / Logistics ----
export const getGameRides = (gameId) => api(`/games/${gameId}/rides`);
export const createGameRide = (gameId, payload) =>
  api(`/games/${gameId}/rides`, { method: "POST", body: payload });
export const requestRideSeats = (gameId, rideId, seatsRequested = 1) =>
  api(`/games/${gameId}/rides/${rideId}/request`, {
    method: "POST",
    body: { seats_requested: seatsRequested },
  });
export const respondRideRequest = (gameId, rideId, requestId, action) =>
  api(`/games/${gameId}/rides/${rideId}/respond`, {
    method: "POST",
    body: { request_id: requestId, action },
  });
export const deleteRide = (gameId, rideId) =>
  api(`/games/${gameId}/rides/${rideId}`, { method: "DELETE" });
export const kickRidePassenger = (gameId, rideId, requestId) =>
  api(`/games/${gameId}/rides/${rideId}/kick`, {
    method: "POST",
    body: { request_id: requestId },
  });

// ---- Leaderboard ----
export const getLeaderboard = () => api("/leaderboard");
export const getTeamsLeaderboard = () => api("/leaderboard/teams");
export const getSeasonStats = () => api("/leaderboard/season");

// ---- Teams ----
export const createTeam = (name) =>
  api("/teams/create", { method: "POST", body: { name } });
export const getAllTeams = () => api("/teams");
export const getTeamDetail = (id) => api(`/teams/${id}`);
export const applyToTeam = (id, message) =>
  api(`/teams/${id}/apply`, { method: "POST", body: { message } });
export const cancelApplication = (id) =>
  api(`/teams/${id}/cancel-application`, { method: "POST" });
export const resolveApplication = (id, applicationId, action) =>
  api(`/teams/${id}/resolve`, { method: "POST", body: { application_id: applicationId, action } });
export const inviteToTeam = (id, playerNickname) =>
  api(`/teams/${id}/invite`, { method: "POST", body: { player_nickname: playerNickname } });
export const getMyInvites = () => api("/teams/my/invites");
export const respondToInvite = (inviteId, action) =>
  api(`/teams/invites/${inviteId}/respond`, { method: "POST", body: { action } });
export const leaveTeam = () =>
  api("/teams/leave", { method: "POST" });
export const kickFromTeam = (teamId, playerId) =>
  api(`/teams/${teamId}/kick`, { method: "POST", body: { player_id: playerId } });
export const transferCaptain = (teamId, newCaptainId) =>
  api(`/teams/${teamId}/transfer-captain`, {
    method: "POST",
    body: { new_captain_id: newCaptainId },
  });
export const disbandTeam = (teamId) =>
  api(`/teams/${teamId}/disband`, { method: "POST" });

// ---- Loot / Fortune ----
export const getLootState = () => api("/loot/state");
export const spinLoot = () =>
  api("/loot/spin", { method: "POST" });
export const requestUseLootReward = (rewardId) =>
  api(`/loot/rewards/${rewardId}/request-use`, { method: "POST" });

// ---- Admin loot ----
export const adminGetLootRequests = () =>
  api("/admin/loot/requests");
export const adminDeactivateLoot = (rewardId) =>
  api(`/admin/loot/${rewardId}/deactivate`, { method: "POST" });
export const adminGetGameEquipmentStock = (gameId) =>
  api(`/admin/games/${gameId}/equipment-stock`);
export const adminUpdateGameEquipmentStock = (gameId, payload) =>
  api(`/admin/games/${gameId}/equipment-stock`, { method: "POST", body: payload });

// ---- Admin ----
export const adminCreateGame = (data) =>
  api("/admin/games", { method: "POST", body: data });
export const adminSetGameStatus = (id, status) =>
  api(`/admin/games/${id}/status`, { method: "POST", body: { status } });
export const adminKillPlayer = (gameId, playerId) =>
  api(`/admin/games/${gameId}/kill`, { method: "POST", body: { player_id: playerId } });
export const adminEndRound = (gameId, winnerTeam) =>
  api(`/admin/games/${gameId}/end-round`, { method: "POST", body: { winner_team: winnerTeam } });
export const adminCreateTeam = (name) =>
  api("/admin/teams", { method: "POST", body: { name } });
export const adminAddPoints = (nickname, amount) =>
  api("/admin/points", { method: "POST", body: { nickname, amount } });
export const adminReviewCheckin = (gameId, playerId, action) =>
  api(`/admin/games/${gameId}/checkin-review`, {
    method: "POST",
    body: { player_id: playerId, action },
  });
export const adminKickFromGame = (gameId, playerId) =>
  api(`/admin/games/${gameId}/kick-player`, {
    method: "POST",
    body: { player_id: playerId },
  });
export const adminMoveGameTeam = (gameId, playerId, targetTeam) =>
  api(`/admin/games/${gameId}/move-player`, {
    method: "POST",
    body: { player_id: playerId, target_team: targetTeam },
  });
export const adminShuffleGameTeams = (gameId) =>
  api(`/admin/games/${gameId}/shuffle-teams`, {
    method: "POST",
  });
export const adminSelectMvp = (gameId, roundId, targetPlayerId) =>
  api(`/admin/games/${gameId}/mvp-select`, {
    method: "POST",
    body: { round_id: roundId, target_player_id: targetPlayerId },
  });
export const adminAddPlayersByUsername = (gameId, usernames) =>
  api(`/admin/games/${gameId}/add-by-username`, {
    method: "POST",
    body: { usernames },
  });
export const adminAddToBlacklist = (playerId, reason) =>
  api("/admin/blacklist/add", {
    method: "POST",
    body: { player_id: playerId, reason },
  });
export const adminRemoveFromBlacklist = (playerId) =>
  api("/admin/blacklist/remove", {
    method: "POST",
    body: { player_id: playerId },
  });