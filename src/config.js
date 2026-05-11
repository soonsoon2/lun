/**
 * Configuration management — ~/.lun/
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join } from "path";

export const LUN_DIR = join(process.env.HOME, ".lun");
export const CONFIG_PATH = join(LUN_DIR, "config.json");

// Sessions dir is configurable via config.sessionsPath
export function getSessionsDir() {
  const config = loadConfig();
  return config?.sessionsPath || join(LUN_DIR, "sessions");
}

// For backward compat — dynamic getter
export const SESSIONS_DIR = join(LUN_DIR, "sessions");

export function ensureDirs() {
  mkdirSync(LUN_DIR, { recursive: true });
  mkdirSync(getSessionsDir(), { recursive: true });
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  mkdirSync(LUN_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function defaultConfig() {
  return {
    language: "en",
    providers: ["kiro", "claude", "copilot"],
    models: { kiro: "auto", claude: "sonnet", copilot: "auto" },
    timeout: 120,
    sessionsPath: join(LUN_DIR, "sessions"),
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
