/**
 * Terminal UI components — banner, select, progress.
 */
import { createInterface } from "readline";
import { t } from "./i18n.js";
import { PROVIDERS } from "./providers.js";

export const VERSION = "1.2.0";

// ============================================================
// BANNER
// ============================================================
export function printBanner() {
  console.log(`
  \x1b[90m+--------------------------------------------+
  |                                            |
  |\x1b[0m  \x1b[1mLun\x1b[0m v${VERSION}                                \x1b[90m|
  |\x1b[0m  ${t("tagline").slice(0, 40).padEnd(40)}  \x1b[90m|
  |                                            |
  |\x1b[0m  Agents: kiro · claude · copilot           \x1b[90m|
  |\x1b[0m  Docs:   lun --help                        \x1b[90m|
  |                                            |
  +--------------------------------------------+\x1b[0m
`);
}

// ============================================================
// INTERACTIVE SELECT (arrow keys)
// ============================================================
export async function selectFromList(title, items, multi = false) {
  const hint = multi ? t("multi_hint") : t("select_hint");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let cursor = 0;
    let selected = new Set(items.map((item, idx) => item.checked ? idx : -1).filter(i => i >= 0));
    const totalLines = items.length + 1;

    function draw() {
      let out = `\x1b[1m${title}\x1b[0m \x1b[90m${hint}\x1b[0m\n`;
      for (let i = 0; i < items.length; i++) {
        const arrow = i === cursor ? "\x1b[36m>\x1b[0m" : " ";
        const check = multi ? (selected.has(i) ? " \x1b[32m*\x1b[0m" : " o") : "";
        const label = items[i].label || items[i];
        out += ` ${arrow}${check} ${label}\n`;
      }
      return out;
    }

    process.stdout.write(draw());

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    const onData = (key) => {
      if (key === "\x1b[A") cursor = Math.max(0, cursor - 1);
      else if (key === "\x1b[B") cursor = Math.min(items.length - 1, cursor + 1);
      else if (key === " " && multi) { selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor); }
      else if (key === "\r" || key === "\n") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        rl.close();
        if (multi) return resolve([...selected].map(i => items[i].value || items[i]));
        return resolve(items[cursor].value !== undefined ? items[cursor].value : items[cursor]);
      } else if (key === "\x03") { process.stdin.setRawMode(false); process.exit(0); return; }
      else return; // ignore other keys, no redraw

      // Redraw
      process.stdout.write(`\x1b[${totalLines}A\x1b[J`);
      process.stdout.write(draw());
    };

    process.stdin.on("data", onData);
  });
}

// ============================================================
// TEXT PROMPT
// ============================================================
export async function promptText(question, defaultVal = "") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` \x1b[90m(${defaultVal})\x1b[0m` : "";
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

// ============================================================
// PROGRESS DISPLAY
// ============================================================
export class Progress {
  constructor(pids, silent = false) {
    this.pids = pids;
    this.silent = silent;
    this.status = Object.fromEntries(pids.map(p => [p, { state: "wait" }]));
    this.lines = 0;
  }

  start() {
    if (this.silent) return;
    console.log("");
    this.drawFresh();
  }

  update(pid, state, data = {}) {
    this.status[pid] = { state, ...data };
    if (!this.silent) this.redraw();
  }

  drawFresh() {
    const out = this.buildOutput();
    process.stdout.write(out);
    this.lines = out.split("\n").length - 1;
  }

  redraw() {
    if (this.lines > 0) process.stdout.write(`\x1b[${this.lines}A\x1b[J`);
    this.drawFresh();
  }

  buildOutput() {
    let out = "";
    for (const pid of this.pids) {
      const s = this.status[pid];
      const name = (PROVIDERS[pid]?.name || pid).padEnd(14);
      if (s.state === "wait") out += `  \x1b[90mo ${name} ${t("waiting")}\x1b[0m\n`;
      else if (s.state === "run") out += `  \x1b[33m~ ${name} ${t("responding")}\x1b[0m\n`;
      else if (s.state === "done") out += `  \x1b[32mv ${name} ${s.elapsed}s\x1b[0m \x1b[90m(${s.model || "auto"})\x1b[0m\n`;
      else out += `  \x1b[31mx ${name} ${t("error_label")}\x1b[0m\n`;
    }
    return out;
  }

  finish() {
    if (!this.silent) console.log("");
  }
}
