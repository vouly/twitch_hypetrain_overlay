import { WebSocket } from "ws";
import fetch from "node-fetch";

const TWITCH_EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";

export default class TwitchEventSub {
  constructor(broadcast, { accessToken, refreshToken, onTokenRefresh }) {
    this.broadcast = broadcast;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.onTokenRefresh = onTokenRefresh;
    this.ws = null;
    this.sessionId = null;
    this.keepAliveTimeout = null;
    this.reconnectDelay = 2000;
    this.userId = null;
    this.stopped = false;
  }

  disconnect() {
    this.stopped = true;
    clearTimeout(this.keepAliveTimeout);
    this.ws?.terminate();
  }

  async connect() {
    if (this.stopped) return;
    try {
      this.userId = await this.getUserId();
      console.log(`[Twitch] Kanal gefunden: ${process.env.TWITCH_CHANNEL_LOGIN} (ID: ${this.userId})`);
      this.openWebSocket(TWITCH_EVENTSUB_URL);
    } catch (err) {
      console.error("[Twitch] Verbindungsfehler:", err.message);
      console.error("  → Prüfe deine .env Einstellungen (Client ID, Kanalname)");
      setTimeout(() => this.connect(), 10000);
    }
  }

  openWebSocket(url) {
    console.log("[Twitch] Verbinde mit EventSub WebSocket...");
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[Twitch] WebSocket verbunden, warte auf Session...");
    });

    this.ws.on("message", (data) => {
      try {
        this.handleMessage(JSON.parse(data.toString()));
      } catch (e) {
        console.error("[Twitch] Nachricht konnte nicht verarbeitet werden:", e);
      }
    });

    this.ws.on("close", (code) => {
      if (this.stopped) return;
      console.log(`[Twitch] WebSocket getrennt (${code}). Reconnect in ${this.reconnectDelay / 1000}s...`);
      clearTimeout(this.keepAliveTimeout);
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on("error", (err) => {
      console.error("[Twitch] WebSocket Fehler:", err.message);
    });
  }

  async handleMessage(msg) {
    const type = msg.metadata?.message_type;

    if (type === "session_welcome") {
      this.sessionId = msg.payload.session.id;
      const keepAliveSeconds = msg.payload.session.keepalive_timeout_seconds;
      console.log(`[Twitch] Session bereit: ${this.sessionId}`);
      this.resetKeepAlive(keepAliveSeconds);
      await this.subscribeToEvents();
    }

    if (type === "session_keepalive") {
      this.resetKeepAlive(30);
    }

    if (type === "session_reconnect") {
      const newUrl = msg.payload.session.reconnect_url;
      console.log("[Twitch] Server fordert Reconnect an...");
      this.openWebSocket(newUrl);
    }

    if (type === "notification") {
      this.resetKeepAlive(30);
      const subType = msg.metadata.subscription_type;
      const event = msg.payload.event;

      if (subType === "channel.hype_train.begin") {
        console.log(`[HypeTrain] 🚂 Gestartet! Level ${event.level}, Progress: ${event.progress}/${event.goal}`);
        this.broadcast({ type: "hype_train.begin", event });
      }

      if (subType === "channel.hype_train.progress") {
        const pct = Math.round((event.progress / event.goal) * 100);
        console.log(`[HypeTrain] ⚡ Fortschritt: ${event.progress}/${event.goal} (${pct}%) Level ${event.level}`);
        this.broadcast({ type: "hype_train.progress", event });
      }

      if (subType === "channel.hype_train.end") {
        console.log(`[HypeTrain] 🏁 Beendet! Level ${event.level} erreicht!`);
        this.broadcast({ type: "hype_train.end", event });
      }
    }
  }

  resetKeepAlive(seconds) {
    clearTimeout(this.keepAliveTimeout);
    this.keepAliveTimeout = setTimeout(() => {
      console.warn("[Twitch] Keep-alive timeout – reconnecting...");
      this.ws?.terminate();
    }, (seconds + 5) * 1000);
  }

  async subscribeToEvents() {
    const events = [
      "channel.hype_train.begin",
      "channel.hype_train.progress",
      "channel.hype_train.end",
    ];

    for (const type of events) {
      try {
        await this.createSubscription(type);
        console.log(`[Twitch] ✓ Subscribed: ${type}`);
      } catch (e) {
        console.error(`[Twitch] ✗ Subscription fehlgeschlagen für ${type}:`, e.message);
      }
    }
  }

  async createSubscription(type, isRetry = false) {
    const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        "Client-Id": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        version: "2",
        condition: { broadcaster_user_id: this.userId },
        transport: {
          method: "websocket",
          session_id: this.sessionId,
        },
      }),
    });

    if (!res.ok) {
      if (res.status === 401 && !isRetry) {
        await this.refreshAccessToken();
        return this.createSubscription(type, true);
      }
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
  }

  async refreshAccessToken() {
    console.log("[Twitch] Token abgelaufen, erneuere...");
    const params = new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    });
    const res = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
    if (!res.ok) throw new Error(`Token-Refresh fehlgeschlagen: HTTP ${res.status}`);
    const tokens = await res.json();
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.onTokenRefresh(tokens);
    console.log("[Twitch] Token erfolgreich erneuert ✓");
  }

  async getUserId() {
    const login = process.env.TWITCH_CHANNEL_LOGIN?.toLowerCase();
    if (!login) throw new Error("TWITCH_CHANNEL_LOGIN ist nicht gesetzt");

    const res = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
      headers: {
        "Client-Id": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!res.ok) throw new Error(`Benutzer-API Fehler: HTTP ${res.status}`);
    const data = await res.json();
    if (!data.data?.[0]) throw new Error(`Kanal "${login}" nicht gefunden`);
    return data.data[0].id;
  }
}
