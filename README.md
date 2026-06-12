# 🚂 Twitch Hype Train Overlay

Ein animiertes Browser-Overlay für Twitch Hype Trains – als OBS Browser Source einsetzbar.

Wenn auf deinem Kanal ein Hype Train startet, fährt ein animierter Zug ins Bild, zeigt den aktuellen Level und den Fortschritt per Shimmer-Balken an und verschwindet 8 Sekunden nach dem Ende wieder. Nach 10 Sekunden Inaktivität schrumpft das Overlay auf einen kompakten Ring-Modus (160 × 160 px), der diskret in einer Ecke bleibt.

![Demo-Modus](public/Train_Minimal.png) ![Demo-Modus](public/Train_Progress.gif)
> Tipp: Öffne die `public/overlay.html` direkt im Browser ohne laufenden Server – das Overlay startet automatisch eine Demo-Animation durch alle 5 Level.

---

## Features

- **Animierter Zug** mit Lok, zwei Waggons, Dampfwolken und Schienenschweller-Scroll
- **Shimmer-Fortschrittsbalken** mit Level-Badge und Milestone-Markierungen
- **Kompakt-Modus** – kollabiert nach 30 s Pause auf einen kreisförmigen Ring-Fortschritt
- **Automatischer Reconnect** – der WebSocket zu Twitch und zur Overlay-Seite verbindet sich nach Verbindungsabbrüchen selbst neu
- **Token-Refresh** – abgelaufene OAuth-Tokens werden im Hintergrund erneuert, kein Neustart nötig
- **Setup-Wizard** – erster Start öffnet ein Browser-Formular, kein manuelles Bearbeiten der `.env` nötig
- **Test-Endpoints** – Events lokal simulieren ohne echten Hype Train auf dem Kanal

---

## Voraussetzungen

| Abhängigkeit | Version | Link |
|---|---|---|
| **Node.js** | v18 oder neuer | [nodejs.org](https://nodejs.org) |
| **OBS Studio** | beliebig | [obsproject.com](https://obsproject.com) |
| **Twitch Developer Account** | – | [dev.twitch.tv](https://dev.twitch.tv/console/apps) |

Der Twitch-Kanal muss **Affiliate oder Partner** sein, damit Hype Train Events ausgelöst werden.

### npm-Pakete

| Paket | Zweck | Link |
|---|---|---|
| [express](https://expressjs.com) | HTTP-Server, statische Dateien, OAuth-Routen | [npmjs.com/package/express](https://www.npmjs.com/package/express) |
| [ws](https://github.com/websockets/ws) | WebSocket-Server für die Overlay-Verbindung | [npmjs.com/package/ws](https://www.npmjs.com/package/ws) |
| [node-fetch](https://github.com/node-fetch/node-fetch) | HTTP-Requests zur Twitch API | [npmjs.com/package/node-fetch](https://www.npmjs.com/package/node-fetch) |
| [dotenv](https://github.com/motdotla/dotenv) | `.env`-Datei laden | [npmjs.com/package/dotenv](https://www.npmjs.com/package/dotenv) |

---

## Installation

```bash
git clone https://github.com/vouly/twitch_hypetrain_overlay.git
cd twitch_hypetrain_overlay
npm install
```

---

## Konfiguration

### 1. Twitch App erstellen

1. Öffne [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) und klicke **„Register Your Application"**
2. Name: beliebig (z. B. `Hype Train Overlay`)
3. OAuth Redirect URL: `http://localhost:3000/auth/callback`
4. Category: `Broadcasting Suite`
5. Nach dem Erstellen: **Client ID** kopieren und ein **Client Secret** generieren

### 2. Umgebungsvariablen

```bash
cp env.example .env
```

```env
TWITCH_CLIENT_ID=abc123...
TWITCH_CLIENT_SECRET=xyz789...
TWITCH_CHANNEL_LOGIN=deinkanal   # Kleinbuchstaben
PORT=3000
```

Alternativ: Beim ersten Start ohne `.env` öffnet der Server automatisch einen Setup-Wizard im Browser, der die Konfiguration für dich speichert.

### 3. Starten & autorisieren

```bash
npm start
```

Beim ersten Start ohne gespeicherten Token öffnet sich automatisch die Autorisierungsseite. Nach dem Bestätigen auf Twitch wird der Token in `.tokens.json` gespeichert – weitere Starts laufen vollautomatisch.

---

## OBS einrichten

1. In OBS: Quelle **+** → **Browser-Quelle**
2. URL: `http://localhost:3000`
3. Breite: **400**, Höhe: **180**
4. **„Quelle herunterfahren, wenn nicht sichtbar"** deaktivieren
5. Hintergrundfarbe: transparent (Standard)

Das Overlay erscheint automatisch, wenn ein Hype Train beginnt, und blendet sich 8 Sekunden nach dem Ende aus.

---

## Testen

Mit laufendem Server können Events manuell ausgelöst werden – kein echter Hype Train auf dem Kanal nötig:

| URL | Beschreibung |
|---|---|
| `http://localhost:3000/test/begin?level=1&goal=1800` | Hype Train starten |
| `http://localhost:3000/test/progress?level=1&progress=900&goal=1800` | Fortschritt setzen |
| `http://localhost:3000/test/end?level=1` | Hype Train beenden |
| `http://localhost:3000/test/sequence` | Komplette Sequenz automatisch (~12 s) |
| `http://localhost:3000/health` | Serverstatus und Anzahl verbundener Clients |

Alle Query-Parameter bei `begin` und `progress` sind optional; ohne Angabe werden Standardwerte verwendet.

---

## Anpassen

Alle Anpassungen erfolgen direkt in `public/overlay.html`:

| Was | Wo                                                                     |
|---|------------------------------------------------------------------------|
| Verzögerung bis Kompakt-Modus | `const COMPACT_DELAY = 10_000` (10 Sekunden)                           |

---

## Entwicklung

```bash
npm run dev   # startet mit --watch, Neustart bei Dateiänderungen
```

Kein Build-Schritt, kein Linter, keine Tests.

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| `[Auth] Keine Tokens gefunden` | `http://localhost:3000/auth` öffnen und Twitch-Autorisierung durchführen |
| `Token-Austausch fehlgeschlagen` | Redirect URL in der Twitch App prüfen: `http://localhost:3000/auth/callback` |
| `Kanal nicht gefunden` | `TWITCH_CHANNEL_LOGIN` muss ausschließlich Kleinbuchstaben enthalten |
| Overlay bleibt leer | Prüfen ob Node.js läuft: `http://localhost:3000/health` aufrufen |
| Kein Event empfangen | Kanal muss Twitch Affiliate oder Partner sein |
