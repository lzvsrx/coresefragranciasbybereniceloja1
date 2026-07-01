import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

function loadLocalEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const dbFile = "server/data/store.db";
const remoteName = process.env.GITHUB_DB_REMOTE || "origin";
const branchName = process.env.GITHUB_DB_BRANCH || "main";
const enabled = String(process.env.GITHUB_DB_SYNC || "").toLowerCase() === "true";

let timer = null;
let running = false;
let queuedReason = "";

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: rootDir, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.output = `${stdout || ""}${stderr || ""}`.trim();
        reject(error);
        return;
      }
      resolve(`${stdout || ""}${stderr || ""}`.trim());
    });
  });
}

export async function syncDatabaseToGithub(reason = "atualizacao do banco") {
  if (running) return { skipped: true, reason: "sync em andamento" };
  running = true;

  try {
    await runGit(["add", dbFile]);
    const status = await runGit(["status", "--porcelain", "--", dbFile]);
    if (!status.trim()) return { changed: false, message: "Banco sem alteracoes para enviar." };

    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    await runGit(["commit", "-m", `Atualiza banco de dados da loja - ${stamp}`, "--", dbFile]);
    await runGit(["push", remoteName, `HEAD:${branchName}`]);
    return { changed: true, message: `Banco enviado ao GitHub (${reason}).` };
  } finally {
    running = false;
  }
}

export function scheduleDatabaseSync(checkpoint, reason = "atualizacao do banco") {
  if (!enabled) return;
  queuedReason = reason;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      if (typeof checkpoint === "function") checkpoint();
      const result = await syncDatabaseToGithub(queuedReason);
      console.log(result.message || "Sincronizacao do banco concluida.");
    } catch (error) {
      console.error(`Falha ao sincronizar banco com GitHub: ${error.output || error.message}`);
    }
  }, Number(process.env.GITHUB_DB_SYNC_DELAY_MS || 12000));
}

export function isGithubDbSyncEnabled() {
  return enabled;
}
