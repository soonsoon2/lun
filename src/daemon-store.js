import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { estimateCost } from "./pricing.js";
import { getLogsDir, getReportsDir, LUN_DIR } from "./config.js";

// User-facing history (logs, usage, reports) lives in the workspace so it's
// easy to find. The daemon *state* pointer stays in ~/.lun because it's
// runtime plumbing every `lun` invocation reads to locate a running daemon.
const LOGS_DIR = getLogsDir();
export const USAGE_LOG_PATH = join(LOGS_DIR, "usage.ndjson");
export const DAEMON_LOG_PATH = join(LOGS_DIR, "daemon.log");
export const DAEMON_STATE_PATH = join(LUN_DIR, "daemon.json");
export const REPORTS_DIR = getReportsDir();

// Re-exported for backward compatibility (was defined here previously).
export { LUN_DIR };

mkdirSync(LUN_DIR, { recursive: true });

function appendNdjson(path, event) {
  appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}

function round6(n) {
  return Math.round((n || 0) * 1e6) / 1e6;
}

export function writeDaemonState(state) {
  writeFileSync(DAEMON_STATE_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), ...state }, null, 2));
}

export function appendDaemonLog(message, data = {}) {
  appendNdjson(DAEMON_LOG_PATH, { level: data.level || "info", message, ...data });
}

export function appendUsageEvent(event) {
  appendNdjson(USAGE_LOG_PATH, event);
}

export function readNdjson(path, limit = 200) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

export function readDaemonState() {
  if (!existsSync(DAEMON_STATE_PATH)) return null;
  try { return JSON.parse(readFileSync(DAEMON_STATE_PATH, "utf-8")); } catch { return null; }
}

export function summarizeUsage(limit = 5000) {
  const events = readNdjson(USAGE_LOG_PATH, limit);
  const runs = events.filter(e => e.type === "provider_run");
  const providers = {};
  let totalLatency = 0;
  let ok = 0;
  let errors = 0;
  let totalCost = 0;

  for (const run of runs) {
    const id = run.provider || "unknown";
    const bucket = providers[id] || {
      provider: id,
      count: 0,
      ok: 0,
      errors: 0,
      avgLatencyMs: 0,
      totalLatencyMs: 0,
      inputChars: 0,
      outputChars: 0,
      costUsd: 0,
      lastModel: "",
      lastStatus: "",
      lastAt: "",
    };
    bucket.count += 1;
    bucket.totalLatencyMs += run.latencyMs || 0;
    bucket.inputChars += run.inputChars || 0;
    bucket.outputChars += run.outputChars || 0;
    const runCost = estimateCost(run.model, run.inputChars || 0, run.outputChars || 0);
    bucket.costUsd += runCost;
    bucket.lastModel = run.model || bucket.lastModel;
    bucket.lastStatus = run.status || bucket.lastStatus;
    bucket.lastAt = run.ts || bucket.lastAt;
    if (run.status === "ok") bucket.ok += 1;
    else bucket.errors += 1;
    providers[id] = bucket;

    totalLatency += run.latencyMs || 0;
    totalCost += runCost;
    if (run.status === "ok") ok += 1;
    else errors += 1;
  }

  const providerRows = Object.values(providers)
    .map(p => ({ ...p, avgLatencyMs: p.count ? Math.round(p.totalLatencyMs / p.count) : 0, costUsd: round6(p.costUsd) }))
    .sort((a, b) => b.count - a.count);

  return {
    totals: {
      runs: runs.length,
      ok,
      errors,
      avgLatencyMs: runs.length ? Math.round(totalLatency / runs.length) : 0,
      inputChars: runs.reduce((sum, r) => sum + (r.inputChars || 0), 0),
      outputChars: runs.reduce((sum, r) => sum + (r.outputChars || 0), 0),
      costUsd: round6(totalCost),
    },
    providers: providerRows,
    recent: runs.slice(-80).reverse().map(r => ({ ...r, costUsd: round6(estimateCost(r.model, r.inputChars || 0, r.outputChars || 0)) })),
    path: USAGE_LOG_PATH,
  };
}
