/**
 * Session persistence — saves conversations to ~/.lun/sessions/
 * Each session produces both .json (machine) and .md (human) files.
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { SESSIONS_DIR, ensureDirs } from "./config.js";
import { PROVIDERS } from "./providers.js";

export class Session {
  constructor() {
    ensureDirs();
    const now = new Date();
    this.id = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.startedAt = now.toISOString();
    this.turns = [];
  }

  addTurn(prompt, results) {
    this.turns.push({
      ts: new Date().toISOString(),
      prompt,
      results: results.map(r => ({
        provider: r.provider,
        model: r.model || "auto",
        text: r.text,
        elapsed: r.elapsed,
        error: !!r.error,
      })),
    });
    this.save();
  }

  save() {
    const jsonPath = join(SESSIONS_DIR, `${this.id}.json`);
    const mdPath = join(SESSIONS_DIR, `${this.id}.md`);

    // JSON
    writeFileSync(jsonPath, JSON.stringify({
      id: this.id,
      startedAt: this.startedAt,
      turns: this.turns,
    }, null, 2));

    // Markdown
    let md = `# Lun Session — ${this.startedAt.slice(0, 10)} ${this.startedAt.slice(11, 16)}\n\n`;
    for (let i = 0; i < this.turns.length; i++) {
      const turn = this.turns[i];
      md += `## Q${i + 1}: ${turn.prompt.slice(0, 100)}${turn.prompt.length > 100 ? "..." : ""}\n\n`;
      for (const r of turn.results) {
        const name = PROVIDERS[r.provider]?.name || r.provider;
        md += `### ${name} (${r.elapsed}s, ${r.model})\n\n`;
        md += `${r.text}\n\n`;
      }
      md += `---\n\n`;
    }
    writeFileSync(mdPath, md);
  }

  get filePath() {
    return join(SESSIONS_DIR, `${this.id}.md`);
  }
}

export function listSessions(limit = 10) {
  if (!existsSync(SESSIONS_DIR)) return [];
  const files = readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map(f => {
    try {
      const data = JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf-8"));
      return {
        id: data.id,
        date: data.startedAt,
        turns: data.turns?.length || 0,
        firstPrompt: data.turns?.[0]?.prompt?.slice(0, 60) || "",
      };
    } catch { return null; }
  }).filter(Boolean);
}
