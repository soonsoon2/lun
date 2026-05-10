/**
 * Configuration management — ~/.lun/
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export const LUN_DIR = join(process.env.HOME, ".lun");
export const CONFIG_PATH = join(LUN_DIR, "config.json");
export const SESSIONS_DIR = join(LUN_DIR, "sessions");

export function ensureDirs() {
  mkdirSync(LUN_DIR, { recursive: true });
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  ensureDirs();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function defaultConfig() {
  return {
    language: "en",
    providers: ["kiro", "claude", "copilot"],
    models: { kiro: "auto", claude: "sonnet", copilot: "auto" },
    timeout: 120,
  };
}
