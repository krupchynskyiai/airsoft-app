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

// ---- Teams ----
export const getGames = (status) =>
  api(`/games${status ? `?status=${status}` : ""}`);
export const getGameDetail = (id) => api(`/games/${id}`);
export const joinGame = (id) =>
  api(`/games/${id}/join`, { method: "POST" });
export const cancelJoinGame = (id) =>
  api(`/games/${id}/cancel`, { method: "POST" });
export const checkinGame = (id) =>
  api(`/games/${id}/checkin`, { method: "POST" });
export const reportDead = (id) =>
  api(`/games/${id}/imdead`, { method: "POST" });
export const getRoundStatus = (id) => api(`/games/${id}/round`);

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