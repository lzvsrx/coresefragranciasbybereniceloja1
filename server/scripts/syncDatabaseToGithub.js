import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncDatabaseToGithub } from "../gitSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../data/store.db");

const db = new DatabaseSync(dbPath);
try {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
} finally {
  db.close();
}

try {
  const result = await syncDatabaseToGithub("sync manual");
  console.log(result.message);
} catch (error) {
  console.error(error.output || error.message);
  process.exit(1);
}
