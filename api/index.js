const app = require("../src/app");
const connectDB = require("../src/config/database");

let dbPromise = null;
function ensureDb() {
  if (!dbPromise) dbPromise = connectDB().catch((err) => {
    console.error("DB connect failed:", err.message);
  });
  return dbPromise;
}

module.exports = async (req, res) => {
  await ensureDb();
  return app(req, res);
};
