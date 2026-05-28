const vscode = require("vscode");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let panel = null;
let statusBar = null;
let output = null;

function activate(context) {
  output = vscode.window.createOutputChannel("Lun");
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "lun.openPanel";
  statusBar.text = "$(circle-large-outline) Lun";
  statusBar.tooltip = "Lun daemon status";
  statusBar.show();

  context.subscriptions.push(output, statusBar);
  context.subscriptions.push(vscode.commands.registerCommand("lun.openPanel", openPanel));
  context.subscriptions.push(vscode.commands.registerCommand("lun.askSelection", askSelection));
  context.subscriptions.push(vscode.commands.registerCommand("lun.reviewCurrentFile", reviewCurrentFile));
  context.subscriptions.push(vscode.commands.registerCommand("lun.explainDiagnostics", explainDiagnostics));
  context.subscriptions.push(vscode.commands.registerCommand("lun.startDaemon", startDaemonCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lun.stopDaemon", stopDaemonCommand));
  context.subscriptions.push(vscode.commands.registerCommand("lun.showStatus", showStatusCommand));

  registerChatParticipant(context);
  refreshStatus();
}

function deactivate() {}

function config() {
  return vscode.workspace.getConfiguration("lun");
}

function daemonUrl() {
  return String(config().get("daemonUrl") || "http://127.0.0.1:3456").replace(/\/$/, "");
}

function workspaceCwd() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

function configuredAgents() {
  const value = config().get("defaultAgents");
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

function lunCommand() {
  const configured = String(config().get("executablePath") || "").trim();
  if (configured) return { command: configured, argsPrefix: [] };

  const localBin = path.join(workspaceCwd(), "bin", "lun.js");
  if (fs.existsSync(localBin)) {
    return { command: process.execPath, argsPrefix: [localBin] };
  }

  return { command: "lun", argsPrefix: [] };
}

function requestJson(method, path, body, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, daemonUrl());
    const data = body ? JSON.stringify(body) : "";
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, res => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch (err) {
          reject(new Error(`Invalid daemon response: ${err.message}`));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`timeout (${timeoutMs / 1000}s)`));
    });
    if (data) req.write(data);
    req.end();
  });
}

function requestEventStream(method, path, body, onEvent, token, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, daemonUrl());
    const data = body ? JSON.stringify(body) : "";
    let settled = false;
    let buffer = "";

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        "content-type": "application/json",
        "accept": "text/event-stream",
        "content-length": Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, res => {
      if (res.statusCode >= 400) {
        let raw = "";
        res.on("data", chunk => { raw += chunk.toString(); });
        res.on("end", () => finish(reject, new Error(raw || `HTTP ${res.statusCode}`)));
        return;
      }

      res.setEncoding("utf8");
      res.on("data", chunk => {
        buffer += chunk;
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseSseBlock(block);
          if (!event) continue;
          onEvent?.(event);
          if (event.type === "done") finish(resolve, event.data);
          if (event.type === "error") finish(reject, new Error(event.data?.error || "Lun stream failed"));
        }
      });
      res.on("end", () => {
        if (!settled) finish(reject, new Error("Lun stream ended before completion."));
      });
    });

    req.on("error", err => {
      if (token?.isCancellationRequested) finish(reject, new Error("cancelled"));
      else finish(reject, err);
    });
    req.on("timeout", () => {
      req.destroy(new Error(`timeout (${timeoutMs / 1000}s)`));
    });

    const cancelDisposable = token?.onCancellationRequested?.(() => {
      req.destroy(new Error("cancelled"));
    });
    req.on("close", () => cancelDisposable?.dispose?.());

    if (data) req.write(data);
    req.end();
  });
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/);
  let type = "message";
  const data = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) type = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length && type === "message") return null;
  try {
    return { type, data: data.length ? JSON.parse(data.join("\n")) : {} };
  } catch {
    return { type, data: { text: data.join("\n") } };
  }
}

async function ensureDaemon() {
  try {
    return await requestJson("GET", "/api/daemon", null, 1200);
  } catch (err) {
    if (!config().get("autoStartDaemon")) throw err;
    await startDaemon();
    for (let i = 0; i < 20; i++) {
      await delay(250);
      try {
        return await requestJson("GET", "/api/daemon", null, 1200);
      } catch {}
    }
    throw new Error("Lun daemon did not respond after start.");
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runLunDaemon(args) {
  return new Promise((resolve, reject) => {
    const lun = lunCommand();
    const child = spawn(lun.command, [...lun.argsPrefix, "daemon", ...args], {
      cwd: workspaceCwd(),
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      output.appendLine(stdout.trim());
      if (stderr.trim()) output.appendLine(stderr.trim());
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `lun daemon ${args.join(" ")} exited ${code}`));
    });
  });
}

async function startDaemon() {
  try {
    await runLunDaemon(["start"]);
  } catch (err) {
    output.appendLine(`daemon start failed: ${err.message}`);
    throw err;
  }
}

async function stopDaemon() {
  await runLunDaemon(["stop"]);
}

async function refreshStatus() {
  try {
    const state = await requestJson("GET", "/api/daemon", null, 1000);
    statusBar.text = "$(check) Lun";
    statusBar.tooltip = `Lun daemon on ${state.host}:${state.port}`;
    return true;
  } catch {
    statusBar.text = "$(circle-slash) Lun";
    statusBar.tooltip = "Lun daemon is not running";
    return false;
  }
}

async function queryLun({ text, mode, agents, sessionId }) {
  await ensureDaemon();
  await refreshStatus();
  const payload = {
    text,
    mode: mode || config().get("defaultMode") || "chat",
    agents: agents || configuredAgents(),
    sessionId,
    cwd: workspaceCwd(),
  };
  return requestJson("POST", "/api/query", payload, 180000);
}

async function queryLunStream({ text, mode, agents, sessionId }, onEvent, token) {
  await ensureDaemon();
  await refreshStatus();
  const payload = {
    text,
    mode: mode || config().get("defaultMode") || "chat",
    agents: agents || configuredAgents(),
    sessionId,
    cwd: workspaceCwd(),
  };
  return requestEventStream("POST", "/api/query/stream", payload, onEvent, token, 180000);
}

function registerChatParticipant(context) {
  if (!vscode.chat || typeof vscode.chat.createChatParticipant !== "function") {
    output.appendLine("VS Code Chat Participant API is not available in this VS Code version.");
    return;
  }

  const participant = vscode.chat.createChatParticipant("vscode-lun.lun", chatHandler);
  participant.iconPath = new vscode.ThemeIcon("sparkle");
  participant.followupProvider = {
    provideFollowups() {
      return [
        { prompt: "/review", label: "Review active file" },
        { prompt: "/workers", label: "Show workers" },
        { prompt: "/status", label: "Show daemon status" },
      ];
    },
  };
  context.subscriptions.push(participant);
}

async function chatHandler(request, context, stream, token) {
  try {
    const command = request.command || "ask";
    if (command === "status") {
      await streamDaemonStatus(stream);
      return { metadata: { command } };
    }
    if (command === "workers") {
      await streamWorkers(stream);
      return { metadata: { command } };
    }

    const text = buildChatPrompt(command, request.prompt || "");
    stream.progress("Connecting to Lun daemon...");
    stream.markdown("### Progress\n\n");
    const seenProgress = new Set();
    const startedAt = Date.now();
    const result = await queryLunStream({
      text,
      mode: "chat",
      sessionId: `vscode-chat-${workspaceCwd()}`,
    }, event => {
      if (event.type !== "progress") return;
      const message = event.data?.message || event.data?.stage || "Lun is working";
      const provider = event.data?.provider ? ` (${event.data.provider})` : "";
      const key = `${event.data?.stage || ""}:${message}`;
      if (seenProgress.has(key)) return;
      seenProgress.add(key);
      stream.progress(`${message}${provider}`);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      stream.markdown(`- ${elapsed}s: ${escapeMarkdown(message)}${provider}\n`);
    }, token);

    if (token?.isCancellationRequested) return { metadata: { command, cancelled: true } };
    stream.markdown("\n---\n\n");
    stream.markdown(formatLunMarkdown(result));
    return { metadata: { command } };
  } catch (err) {
    stream.markdown(`Lun failed: ${err.message}`);
    output.appendLine(err.stack || err.message);
    return { metadata: { error: err.message } };
  }
}

function escapeMarkdown(value) {
  return String(value || "").replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}

function buildChatPrompt(command, prompt) {
  const ctx = activeEditorContext();
  if (command === "review") {
    if (!ctx) return `Review the active workspace. User request: ${prompt || "(none)"}`;
    return `Review this file. Prioritize bugs, regressions, security issues, and missing tests. Be concise.\n\nUser request: ${prompt || "(none)"}\n\n--- File: ${ctx.doc.fileName} ---\n${ctx.doc.getText()}`;
  }
  if (command === "diagnostics") {
    if (!ctx) return "Explain the current VS Code diagnostics, but no active file is open.";
    const diagnostics = vscode.languages.getDiagnostics(ctx.doc.uri);
    const lines = diagnostics.length
      ? diagnostics.map(d => `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`).join("\n")
      : "(no diagnostics)";
    return `Explain these VS Code diagnostics and suggest fixes.\n\nUser request: ${prompt || "(none)"}\n\n--- File: ${ctx.doc.fileName} ---\n${lines}`;
  }
  if (ctx?.selection) {
    return `${prompt}\n\n--- Selection from ${ctx.doc.fileName} ---\n${ctx.selection}`;
  }
  if (ctx && prompt.toLowerCase().includes("file")) {
    return `${prompt}\n\n--- Active file: ${ctx.doc.fileName} ---\n${ctx.doc.getText()}`;
  }
  return prompt;
}

function formatLunMarkdown(result) {
  const items = result.results || [];
  if (!items.length) return "Lun returned no agent responses.";
  return items.map(item => {
    const provider = item.provider || "agent";
    const elapsed = item.elapsed ? `, ${item.elapsed}s` : "";
    const model = item.model ? `, ${item.model}` : "";
    return `### ${provider}${model}${elapsed}\n\n${item.text || "(no response)"}`;
  }).join("\n\n---\n\n");
}

async function streamDaemonStatus(stream) {
  await ensureDaemon();
  const daemon = await requestJson("GET", "/api/daemon");
  stream.markdown([
    "### Lun daemon",
    "",
    `- PID: ${daemon.pid}`,
    `- URL: http://${daemon.host}:${daemon.port}`,
    `- Uptime: ${daemon.uptimeSec || 0}s`,
  ].join("\n"));
}

async function streamWorkers(stream) {
  await ensureDaemon();
  const data = await requestJson("GET", "/api/workers");
  const rows = (data.workers || []).map(w => (
    `| ${w.provider || ""} | ${w.model || w.note || ""} | ${w.ready ? "ready" : "not ready"} | ${w.busy ? "busy" : "idle"} | ${w.queued ?? ""} |`
  ));
  stream.markdown([
    "### Lun workers",
    "",
    "| Provider | Model | Ready | Busy | Queue |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n"));
}

function activeEditorContext() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const doc = editor.document;
  const selection = editor.selection && !editor.selection.isEmpty
    ? doc.getText(editor.selection)
    : "";
  return { editor, doc, selection };
}

async function askSelection() {
  const ctx = activeEditorContext();
  if (!ctx || !ctx.selection) {
    vscode.window.showInformationMessage("Select code first, then run Lun: Ask About Selection.");
    return;
  }
  const prompt = await vscode.window.showInputBox({
    prompt: "Ask Lun about the selected code",
    placeHolder: "What should the agents look for?",
  });
  if (!prompt) return;

  const text = `${prompt}\n\n--- Selection from ${ctx.doc.fileName} ---\n${ctx.selection}`;
  await runAndShow({ title: "Selection", text, mode: config().get("defaultMode") || "chat" });
}

async function reviewCurrentFile() {
  const ctx = activeEditorContext();
  if (!ctx) {
    vscode.window.showInformationMessage("Open a file first.");
    return;
  }
  const text = `Review this file. Prioritize bugs, regressions, security issues, and missing tests. Be concise.\n\n--- File: ${ctx.doc.fileName} ---\n${ctx.doc.getText()}`;
  await runAndShow({ title: "Review", text, mode: "chat" });
}

async function explainDiagnostics() {
  const ctx = activeEditorContext();
  if (!ctx) {
    vscode.window.showInformationMessage("Open a file first.");
    return;
  }
  const diagnostics = vscode.languages.getDiagnostics(ctx.doc.uri);
  if (!diagnostics.length) {
    vscode.window.showInformationMessage("No diagnostics for current file.");
    return;
  }
  const lines = diagnostics.map(d => {
    const start = d.range.start;
    return `${start.line + 1}:${start.character + 1} ${d.message}`;
  }).join("\n");
  const text = `Explain these VS Code diagnostics and suggest fixes.\n\n--- File: ${ctx.doc.fileName} ---\n${lines}`;
  await runAndShow({ title: "Diagnostics", text, mode: "chat" });
}

async function runAndShow({ title, text, mode }) {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Lun: ${title}`,
    cancellable: false,
  }, async () => {
    try {
      const result = await queryLun({ text, mode, sessionId: `vscode-${workspaceCwd()}` });
      showResult(title, result);
      postPanel({ type: "result", title, result });
    } catch (err) {
      vscode.window.showErrorMessage(`Lun failed: ${err.message}`);
      output.appendLine(err.stack || err.message);
    }
  });
}

function showResult(title, result) {
  const parts = [];
  for (const item of result.results || []) {
    parts.push(`## ${item.provider} (${item.elapsed || 0}s, ${item.model || "auto"})\n\n${item.text || "(no response)"}`);
  }
  const docText = `# Lun: ${title}\n\n${parts.join("\n\n---\n\n")}`;
  vscode.workspace.openTextDocument({ language: "markdown", content: docText })
    .then(doc => vscode.window.showTextDocument(doc, { preview: false }));
}

async function startDaemonCommand() {
  try {
    await startDaemon();
    await refreshStatus();
    vscode.window.showInformationMessage("Lun daemon started.");
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start Lun daemon: ${err.message}`);
  }
}

async function stopDaemonCommand() {
  try {
    await stopDaemon();
    await refreshStatus();
    vscode.window.showInformationMessage("Lun daemon stopped.");
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to stop Lun daemon: ${err.message}`);
  }
}

async function showStatusCommand() {
  const ok = await refreshStatus();
  if (!ok) {
    vscode.window.showWarningMessage("Lun daemon is not running.");
    return;
  }
  const [daemon, workers, usage] = await Promise.all([
    requestJson("GET", "/api/daemon"),
    requestJson("GET", "/api/workers"),
    requestJson("GET", "/api/usage"),
  ]);
  const msg = `Lun daemon ${daemon.pid} on ${daemon.host}:${daemon.port} | workers: ${workers.workers.length} | runs: ${usage.totals.runs}`;
  vscode.window.showInformationMessage(msg);
}

function openPanel() {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }
  panel = vscode.window.createWebviewPanel("lunPanel", "Lun", vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.webview.html = panelHtml(panel.webview);
  panel.onDidDispose(() => { panel = null; });
  panel.webview.onDidReceiveMessage(handlePanelMessage);
}

async function handlePanelMessage(message) {
  try {
    if (message.type === "ask") {
      const result = await queryLun({
        text: message.text,
        mode: message.mode || "chat",
        agents: message.agents,
        sessionId: "vscode-panel",
      });
      postPanel({ type: "result", title: "Panel", result });
    } else if (message.type === "refresh") {
      await ensureDaemon();
      const [daemon, workers, usage, logs] = await Promise.all([
        requestJson("GET", "/api/daemon"),
        requestJson("GET", "/api/workers"),
        requestJson("GET", "/api/usage"),
        requestJson("GET", "/api/logs?limit=80"),
      ]);
      postPanel({ type: "state", daemon, workers, usage, logs });
      await refreshStatus();
    } else if (message.type === "start") {
      await startDaemonCommand();
      postPanel({ type: "notice", text: "Daemon started." });
    } else if (message.type === "stop") {
      await stopDaemonCommand();
      postPanel({ type: "notice", text: "Daemon stopped." });
    }
  } catch (err) {
    postPanel({ type: "error", text: err.message });
  }
}

function postPanel(message) {
  if (panel) panel.webview.postMessage(message);
}

function panelHtml(webview) {
  const nonce = String(Date.now());
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    :root{color-scheme:dark light}
    body{font-family:var(--vscode-font-family);padding:14px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
    .row{display:flex;gap:8px;align-items:center;margin-bottom:10px}
    button,select{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:6px 10px;border-radius:4px}
    button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    textarea{width:100%;min-height:90px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:8px;border-radius:4px}
    pre{white-space:pre-wrap;background:var(--vscode-textCodeBlock-background);padding:10px;border-radius:4px;overflow:auto}
    .tabs button{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-foreground)}
    .tabs button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
    .muted{color:var(--vscode-descriptionForeground)}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border-bottom:1px solid var(--vscode-panel-border);padding:6px;text-align:left;font-size:12px}
    .hidden{display:none}
  </style>
</head>
<body>
  <div class="row">
    <strong>Lun</strong>
    <button id="refresh" class="secondary">Refresh</button>
    <button id="start" class="secondary">Start</button>
    <button id="stop" class="secondary">Stop</button>
  </div>
  <div class="tabs row">
    <button data-tab="chat" class="active">Chat</button>
    <button data-tab="workers">Workers</button>
    <button data-tab="usage">Usage</button>
    <button data-tab="logs">Logs</button>
  </div>
  <section id="chat">
    <textarea id="prompt" placeholder="Ask Lun..."></textarea>
    <div class="row">
      <select id="mode"><option value="chat">chat</option><option value="ask">ask</option></select>
      <button id="send">Send</button>
    </div>
    <div id="results"></div>
  </section>
  <section id="workers" class="hidden"></section>
  <section id="usage" class="hidden"></section>
  <section id="logs" class="hidden"></section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentTab = "chat";
    const $ = id => document.getElementById(id);
    document.querySelectorAll("[data-tab]").forEach(btn => btn.onclick = () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b === btn));
      ["chat","workers","usage","logs"].forEach(id => $(id).classList.toggle("hidden", id !== currentTab));
      vscode.postMessage({type:"refresh"});
    });
    $("refresh").onclick = () => vscode.postMessage({type:"refresh"});
    $("start").onclick = () => vscode.postMessage({type:"start"});
    $("stop").onclick = () => vscode.postMessage({type:"stop"});
    $("send").onclick = () => {
      const text = $("prompt").value.trim();
      if (!text) return;
      $("results").innerHTML = "<p class='muted'>Asking...</p>";
      vscode.postMessage({type:"ask", text, mode:$("mode").value});
    };
    window.addEventListener("message", event => {
      const msg = event.data;
      if (msg.type === "result") renderResult(msg.result);
      if (msg.type === "state") renderState(msg);
      if (msg.type === "error") $("results").innerHTML = "<pre>Error: " + esc(msg.text) + "</pre>";
      if (msg.type === "notice") $("results").innerHTML = "<p>" + esc(msg.text) + "</p>";
    });
    function renderResult(result){
      $("results").innerHTML = (result.results || []).map(r => "<h3>" + esc(r.provider) + " · " + esc(String(r.elapsed || 0)) + "s</h3><pre>" + esc(r.text || "") + "</pre>").join("");
      vscode.postMessage({type:"refresh"});
    }
    function renderState(msg){
      $("workers").innerHTML = table(["provider","model","alive","ready","busy","queued","runs"], (msg.workers.workers || []).map(w => [w.provider,w.model || w.note || "",w.alive,w.ready,w.busy,w.queued ?? "",w.runs ?? ""]));
      const providers = msg.usage.providers || [];
      $("usage").innerHTML = "<p class='muted'>Runs: " + msg.usage.totals.runs + " · Avg: " + fmt(msg.usage.totals.avgLatencyMs) + "</p>" + table(["provider","count","ok","err","avg"], providers.map(p => [p.provider,p.count,p.ok,p.errors,fmt(p.avgLatencyMs)]));
      $("logs").innerHTML = (msg.logs.logs || []).slice().reverse().map(l => "<pre>" + esc(l.ts + " " + l.message + " " + JSON.stringify(l)) + "</pre>").join("");
    }
    function table(headers, rows){
      return "<table><thead><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" + rows.map(row => "<tr>" + row.map(c => "<td>" + esc(String(c)) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
    }
    function fmt(ms){ return ms === 0 ? "0.00s" : ms ? (ms/1000).toFixed(ms >= 10000 ? 1 : 2) + "s" : "-"; }
    function esc(value){return String(value ?? "").replace(/[&<>]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch]));}
    vscode.postMessage({type:"refresh"});
  </script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
