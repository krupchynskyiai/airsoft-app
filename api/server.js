const express = require("express");
const path = require("path");
const { authMiddleware } = require("./middleware/auth");
const log = require("../utils/logger");

function createServer() {
  const app = express();

  app.use(express.json());

  // CORS for dev
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-telegram-init-data");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // API request logging
  app.use("/api", (req, res, next) => {
    log.debug(`API ${req.method} ${req.path}`, { body: req.body });
    next();
  });

  // API routes (protected)
  app.use("/api", authMiddleware);
  app.use("/api", require("./routes/players"));
  app.use("/api/games", require("./routes/games"));
  app.use("/api/leaderboard", require("./routes/leaderboard"));
  app.use("/api/admin", require("./routes/admin"));

  // Serve React build (production)
  const webappDist = path.join(__dirname, "..", "webapp", "dist");
  app.use(express.static(webappDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(webappDist, "index.html"));
  });

  return app;
}

module.exports = { createServer };