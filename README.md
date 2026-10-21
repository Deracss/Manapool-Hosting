# ManaPool

The digital version of the ManaPool card game by Gustavo Acevedo.

- `engine/`: the rules engine (TypeScript). Turn structure, mana, the stack, combat and card scripts. See `engine/README.md`.
- `app/`: the Windows desktop game (Electron + React) built on the engine: main menu, deck builder, games against 3 bots, and online play.
- `server/`: the online game server (Node + WebSocket). Rooms with a 4-letter code, up to 4 people, bots in empty seats. It runs the same engine and sends each player only what they may see.

## Playing

Run `ManaPool-Setup-<version>.exe` and follow the installer. It installs for your Windows user only (no administrator rights needed) and adds Start menu and desktop shortcuts. Uninstall it from Windows Settings → Apps.

The installer isn't code-signed, so Windows SmartScreen may warn "Windows protected your PC". Click **More info → Run anyway**.

Saved decks and settings live in `%APPDATA%\ManaPool` and survive reinstalling.

## Building from source

Requires Node.js 20+.

```bash
cd engine && npm install && npm test     # rules tests
cd ../app && npm install
npm start                                # run the game in a window
npm run package:win                      # build release/ManaPool-Setup-<version>.exe (needs NSIS's makensis)
```

`app/test/e2e.cjs` clicks through the real app and saves screenshots (used on Linux with `xvfb-run`).

## Online play (Render + GitHub)

The server is deployed to [Render](https://render.com) from this repository with `render.yaml` (free plan).

**First-time setup**

1. Push this repository to GitHub (branch `main`).
2. In Render: **New → Blueprint**, connect your GitHub account, pick this repository, and click **Apply**. Render builds `server/` and starts it.
3. When it's live, Render shows its address, normally `https://manapool-server.onrender.com`. That is the address built into the game (`app/src/renderer/net.ts`, `DEFAULT_SERVER`). If Render gave a different one, change `DEFAULT_SERVER` and rebuild the app, or type it under **Play online → Server address**.

After that, every push to `main` redeploys the server automatically.

**How players use it**: Play online → choose a deck → **Host**. The game wakes the server (the free plan sleeps after 15 minutes without players; waking takes up to a minute), creates a room and shows its code. Friends choose **Join** and type the code. The host presses **Start**; open seats are played by bots. If someone drops, they get 45 seconds to reconnect before a bot plays for them.

**Running the server locally**

```bash
cd server && npm install && npm run dev        # http://localhost:10000/health
```

Then in the game: Play online → Server address → `http://localhost:10000`.
