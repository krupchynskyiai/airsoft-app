const https = require("https");
const http = require("http");
const log = require("../utils/logger");

function ping(url) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          method: "GET",
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: `${u.pathname}${u.search}`,
          timeout: 10000,
          headers: {
            "User-Agent": "airsoft-bot-keepwarm",
          },
        },
        (res) => {
          // drain
          res.on("data", () => {});
          res.on("end", () => resolve({ ok: true, status: res.statusCode }));
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, error: "timeout" });
      });
      req.on("error", (e) => resolve({ ok: false, error: e.message }));
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function startKeepWarm() {
  const enabled = String(process.env.KEEP_WARM_ENABLED || "").toLowerCase() === "true";
  if (!enabled) return;

  const baseUrl = String(process.env.KEEP_WARM_BASE_URL || "").trim();
  if (!baseUrl) {
    log.warn("Keep-warm enabled but KEEP_WARM_BASE_URL missing");
    return;
  }

  const intervalMs = Math.max(
    60_000,
    parseInt(process.env.KEEP_WARM_INTERVAL_MS || "480000", 10) || 480000,
  ); // default 8 minutes

  const healthUrl = new URL("/api/health", baseUrl).toString();

  log.info("Keep-warm started", { healthUrl, intervalMs });

  const tick = async () => {
    const r = await ping(healthUrl);
    if (!r.ok) log.warn("Keep-warm ping failed", { healthUrl, error: r.error });
    else log.debug("Keep-warm ping OK", { status: r.status });
  };

  // run once shortly after boot, then interval
  setTimeout(tick, 15_000);
  setInterval(tick, intervalMs);
}

module.exports = { startKeepWarm };

