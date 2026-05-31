/**
 * Configuration management — ~/.lun/
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join } from "path";

export const LUN_DIR = join(process.env.HOME, ".lun");
export const CONFIG_PATH = join(LUN_DIR, "config.json");

// The lun workspace lives under the user's Documents folder and holds
// everything the user might want to see: agent run dir, sessions, logs,
// reports. Configurable via config.workDir.
export const DEFAULT_WORK_DIR = join(process.env.HOME, "Documents", "lun-workspace");

/** Workspace root (config.workDir). Created on demand. */
export function getWorkDir() {
  const config = loadConfig();
  const dir = config?.workDir || DEFAULT_WORK_DIR;
  return ensureWorkDir(dir);
}

export function ensureWorkDir(dir = DEFAULT_WORK_DIR) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    try { mkdirSync(LUN_DIR, { recursive: true }); } catch {}
    return LUN_DIR;
  }
  return dir;
}

/**
 * Directory where agents actually run (their cwd). Kept as an isolated,
 * mostly-empty subfolder of the workspace so kiro/codex stay fast — logs and
 * sessions live elsewhere in the workspace and never pollute it.
 */
export function getRunDir() {
  const dir = join(getWorkDir(), "run");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

/** Logs (daemon.log, usage.ndjson, daemon.json) live under the workspace. */
export function getLogsDir() {
  const dir = join(getWorkDir(), "logs");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

/** Full agent reports live under the workspace. */
export function getReportsDir() {
  const dir = join(getWorkDir(), "reports");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

// Sessions dir — defaults to <workspace>/sessions, override via config.sessionsPath
export function getSessionsDir() {
  const config = loadConfig();
  if (config?.sessionsPath) return config.sessionsPath;
  const dir = join(getWorkDir(), "sessions");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

// For backward compat — dynamic getter
export const SESSIONS_DIR = join(LUN_DIR, "sessions");

export function ensureDirs() {
  mkdirSync(LUN_DIR, { recursive: true });
  mkdirSync(getSessionsDir(), { recursive: true });
}

export function loadConfig() {
  try {
    return normalizeConfig(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")));
  } catch {
    return null;
  }
}

function normalizeConfig(config) {
  if (!config) return config;
  const next = { ...config };

  if (Array.isArray(next.providers)) {
    next.providers = next.providers.map(id => id === "gemini" ? "agy" : id);
    next.providers = [...new Set(next.providers)];
  }

  if (next.models?.gemini && !next.models?.agy) {
    next.models = { ...next.models, agy: "auto" };
    delete next.models.gemini;
  }

  if (next.pmAgent === "gemini") next.pmAgent = "agy";
  if (next.moderator === "gemini") next.moderator = "agy";

  // Legacy default sessionsPath pointed at ~/.lun/sessions. Drop it so sessions
  // now live in the workspace alongside logs/reports. A custom path is kept.
  const legacySessions = join(LUN_DIR, "sessions");
  if (next.sessionsPath === legacySessions) delete next.sessionsPath;

  return next;
}

export function saveConfig(config) {
  mkdirSync(LUN_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function defaultConfig() {
  return {
    language: "en",
    providers: ["kiro", "claude", "copilot"],
    models: { kiro: "auto", claude: "sonnet", copilot: "auto", agy: "auto" },
    timeout: 120,
    workDir: DEFAULT_WORK_DIR,
    moderator: "claude",
    autoDiscuss: {
      enabled: false,
      maxTurns: 3,
      maxTime: 120,
    },
  };
}

/**
 * Migrate sessions from old path to new path.
 * Returns number of files moved.
 */
export function migrateSessions(oldPath, newPath) {
  if (!existsSync(oldPath)) return 0;
  mkdirSync(newPath, { recursive: true });
  const files = readdirSync(oldPath);
  let count = 0;
  for (const f of files) {
    const src = join(oldPath, f);
    const dest = join(newPath, f);
    if (!existsSync(dest)) {
      cpSync(src, dest);
      count++;
    }
  }
  return count;
}
