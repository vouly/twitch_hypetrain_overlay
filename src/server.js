import "dotenv/config";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { exec } from "child_process";
import fetch from "node-fetch";
import TwitchEventSub from "./eventsub.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const TOKEN_FILE = join(__dirname, "../.tokens.json");
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

const app = express();
const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/overlay-ws" });
const overlayClients = new Set();

wss.on("connection", (ws) => {
  overlayClients.add(ws);
  console.log(`[Overlay] Client connected. Total: ${overlayClients.size}`);
  ws.on("close", () => {
    overlayClients.delete(ws);
    console.log(`[Overlay] Client disconnected. Total: ${overlayClients.size}`);
  });
});

function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const client of overlayClients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function isConfigured() {
  return !!(process.env.TWITCH_CLIENT_ID &&
            process.env.TWITCH_CLIENT_SECRET &&
            process.env.TWITCH_CHANNEL_LOGIN);
}

function openBrowser(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"` :
              process.platform === "darwin" ? `open "${url}"` :
              `xdg-open "${url}"`;
  exec(cmd, () => {});
}

app.use(express.static(join(__dirname, "../public")));
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  if (!isConfigured()) return res.redirect("/setup");
  res.sendFile(join(__dirname, "../public/overlay.html"));
});

app.get("/health", (req, res) => res.json({ status: "ok", clients: overlayClients.size }));

// ── Setup wizard ─────────────────────────────────────────────────────────────

app.get("/setup", (req, res) => {
  if (isConfigured()) return res.redirect("/");
  res.sendFile(join(__dirname, "../public/setup.html"));
});

app.post("/setup", (req, res) => {
  const { client_id, client_secret, channel } = req.body;
  if (!client_id?.trim() || !client_secret?.trim() || !channel?.trim()) {
    return res.redirect("/setup?error=1");
  }
  const envContent = [
    `TWITCH_CLIENT_ID=${client_id.trim()}`,
    `TWITCH_CLIENT_SECRET=${client_secret.trim()}`,
    `TWITCH_CHANNEL_LOGIN=${channel.trim().toLowerCase()}`,
    `PORT=${PORT}`,
  ].join("\n") + "\n";
  writeFileSync(join(__dirname, "../.env"), envContent);
  process.env.TWITCH_CLIENT_ID     = client_id.trim();
  process.env.TWITCH_CLIENT_SECRET = client_secret.trim();
  process.env.TWITCH_CHANNEL_LOGIN = channel.trim().toLowerCase();
  res.redirect("/auth");
});

// ── OAuth ────────────────────────────────────────────────────────────────────

app.get("/auth", (req, res) => {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "channel:read:hype_train");
  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.send(successPage("❌ Verbindung fehlgeschlagen", `Twitch meldet: ${error}`, false));
  }
  try {
    const tokens = await exchangeCode(code);
    saveTokens(tokens);
    res.send(successPage(
      "✅ Alles bereit!",
      `Füge jetzt diese URL als Browser Source in OBS ein:<br>
       <code>http://localhost:${PORT}</code>`,
      true
    ));
    startEventSub(tokens);
  } catch (err) {
    res.send(successPage("❌ Fehler", err.message, false));
  }
});

function successPage(title, body, success) {
  const color = success ? "#a855f7" : "#f87171";
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body{background:#0a0414;font-family:'Segoe UI',system-ui,sans-serif;color:#e0cfff;
         display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .card{background:rgba(20,8,40,.95);border:1px solid rgba(100,65,165,.5);border-radius:16px;
          padding:48px;max-width:440px;text-align:center;box-shadow:0 0 40px rgba(100,65,165,.3);}
    h1{font-size:28px;font-weight:900;color:${color};margin-bottom:16px;}
    p{font-size:15px;line-height:1.7;color:rgba(224,207,255,.8);}
    code{display:inline-block;background:rgba(0,0,0,.4);border:1px solid rgba(100,65,165,.4);
         border-radius:6px;padding:6px 14px;font-size:16px;color:#e879f9;margin-top:8px;}
  </style></head><body>
  <div class="card"><h1>${title}</h1><p>${body}</p></div>
  </body></html>`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function loadTokens() {
  if (existsSync(TOKEN_FILE)) {
    try { return JSON.parse(readFileSync(TOKEN_FILE, "utf8")); } catch {}
  }
  return null;
}

function saveTokens(tokens) {
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// ── Test endpoints ───────────────────────────────────────────────────────────

app.get("/test/begin", (req, res) => {
  const level      = Number(req.query.level ?? 1);
  const goal       = Number(req.query.goal  ?? 1800);
  const train_type = req.query.train_type ?? "regular";
  broadcast({ type: "hype_train.begin", event: { level, progress: 0, goal, type: train_type } });
  res.json({ sent: "hype_train.begin", level, goal, train_type });
});

app.get("/test/progress", (req, res) => {
  const level    = Number(req.query.level    ?? 1);
  const progress = Number(req.query.progress ?? 900);
  const goal     = Number(req.query.goal     ?? 1800);
  broadcast({ type: "hype_train.progress", event: { level, progress, goal } });
  res.json({ sent: "hype_train.progress", level, progress, goal });
});

app.get("/test/end", (req, res) => {
  const level = Number(req.query.level ?? 1);
  broadcast({ type: "hype_train.end", event: { level, total: 1800 } });
  res.json({ sent: "hype_train.end", level });
});

app.get("/test/sequence", (req, res) => {
  res.json({ started: "sequence" });
  const goal = 1800;
  let level = 1;
  broadcast({ type: "hype_train.begin", event: { level, progress: 0, goal } });
  const steps = [300, 600, 900, 1200, 1500, 1800];
  steps.forEach((progress, i) => {
    setTimeout(() => {
      if (progress >= goal && level < 5) { level++; progress = 0; }
      broadcast({ type: "hype_train.progress", event: { level, progress, goal } });
    }, (i + 1) * 1500);
  });
  setTimeout(() => {
    broadcast({ type: "hype_train.end", event: { level, total: goal } });
  }, (steps.length + 1) * 1500);
});

// ── EventSub ─────────────────────────────────────────────────────────────────

let eventSub = null;

function startEventSub(tokens) {
  eventSub?.disconnect();
  eventSub = new TwitchEventSub(broadcast, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    onTokenRefresh: saveTokens,
  });
  eventSub.connect();
}

server.listen(PORT, () => {
  console.log(`\n🚂 Twitch Hype Train Overlay läuft!`);
  console.log(`   Browser Source URL: http://localhost:${PORT}`);
  console.log(`   Health Check:       http://localhost:${PORT}/health\n`);

  if (!isConfigured()) {
    console.log("[Setup] Keine Konfiguration gefunden – öffne Setup-Seite...");
    openBrowser(`http://localhost:${PORT}/setup`);
    return;
  }

  const tokens = loadTokens();
  if (tokens) {
    console.log("[Auth] Gespeicherte Tokens gefunden, starte EventSub...");
    startEventSub(tokens);
    openBrowser(`http://localhost:${PORT}`);
  } else {
    console.log(`[Auth] Keine Tokens gefunden – öffne Autorisierung...`);
    openBrowser(`http://localhost:${PORT}/auth`);
  }
});
