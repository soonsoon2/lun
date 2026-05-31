/**
 * Configuration management — ~/.lun/
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join } from "path";

export const LUN_DIR = join(process.env.HOME, ".lun");
export const CONFIG_PATH = join(LUN_DIR, "config.json");

// Default agent working directory — lives under the user's Documents folder.
// Agents (especially kiro/codex) scan their cwd on startup, so running them
// in a dedicated, mostly-empty folder keeps them fast no matter where the
// user invokes `lun` from. Configurable via config.workDir.
export const DEFAULT_WORK_DIR = join(process.env.HOME, "Documents", "lun-workspace");

// Sessions dir is configurable via config.sessionsPath
export function getSessionsDir() {
  const config = loadConfig();
  return config?.sessionsPath || join(LUN_DIR, "sessions");
}

/**
 * The directory agents run in. Defaults to ~/Documents/lun-workspace.
 * Created on demand so it always exists when an agent spawns.
 */
export function getWorkDir() {
  const config = loadConfig();
  const dir = config?.workDir || DEFAULT_WORK_DIR;
  return ensureWorkDir(dir);
}

export function ensureWorkDir(dir = DEFAULT_WORK_DIR) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // If the configured dir can't be created (e.g. permissions), fall back
    // to the lun home so agents still have a small, stable place to run.
    try { mkdirSync(LUN_DIR, { recursive: true }); } catch {}
    return LUN_DIR;
  }
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
    sessionsPath: join(LUN_DIR, "sessions"),
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
