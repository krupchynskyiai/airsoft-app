const { getDB } = require("./connection");
const log = require("../utils/logger");

async function q(sql, params = []) {
  const start = Date.now();
  try {
    const [rows] = await getDB().execute(sql, params);
    log.db("Q", { sql: sql.substring(0, 100), rows: rows.length, ms: Date.now() - start });
    return rows;
  } catch (e) {
    log.error("Q fail", { sql: sql.substring(0, 100), error: e.message });
    throw e;
  }
}

async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

async function ins(sql, params = []) {
  const start = Date.now();
  try {
    const [result] = await getDB().execute(sql, params);
    log.db("INS", { sql: sql.substring(0, 100), id: result.insertId, ms: Date.now() - start });
    return result;
  } catch (e) {
    log.error("INS fail", { sql: sql.substring(0, 100), error: e.message });
    throw e;
  }
}

module.exports = { q, q1, ins };