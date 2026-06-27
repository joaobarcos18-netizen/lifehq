# LifeHQ — your personal operating system

A real desktop app (Windows) that acts like a company app, but for **you**. It accompanies your
life: it sorts your files like a Minecraft hopper, tracks your achievements and goals, logs your
fitness, auto-categorises your expenses, and lets you build your photos into an explorable 3D world.

Everything lives **locally** in a single vault folder on your PC. Nothing leaves your machine unless
you choose to connect an AI key.

## Modules

| Module | What it does |
| --- | --- |
| **Dashboard** | A daily overview of everything — files, achievements, goals, fitness, photos, spending. |
| **File Sorter** | Drop any file in the hopper; it's read and dropped into the right "chest" (category) automatically. Re-sort, move, tag, open or reveal anything. Add your own custom chests. |
| **Achievements** | A timeline of your academic & professional life: degrees, certifications, training, awards, projects — with skills, links, and **attached files** (link the real diploma/certificate from your vault). One click **exports a polished CV to PDF**. |
| **Goals & Fitness** | Life goals with progress bars and milestones, plus a fitness activity log with a trend chart. |
| **Expenses** | Add expenses or import a bank statement (CSV). Transactions are auto-categorised, charted, and checked against monthly budgets. Add your **own categories**, and it **detects recurring subscriptions** and estimates their yearly cost. |
| **Journal** | A line-a-day journal: date, mood, tags and notes, grouped by month. |
| **Command Palette** | Press **Ctrl/Cmd + K** anywhere to instantly capture an expense, goal, achievement or journal note, import files, or jump to any module. |
| **Photo World** | A 3D voxel world (à la Minecraft) with two modes. **Orbit** mode for precise building; **Walk** mode for true first-person exploration — mouse to look, WASD to move, Space to jump, and you walk *up onto* your stacked photo-towers. Place blocks / dig them out with the crosshair. Group photos into coloured, named **regions** (e.g. "Family temple", "Adventures cave"). |

## How the sorting works (the "brain")

By default LifeHQ sorts **locally with fast rules** — free, private, offline. It scores each file by
its extension and the keywords in its name; it scores each transaction by merchant/keyword hints. You
can correct anything, and your manual choice always wins.

Optionally, in **Settings → AI assist**, you can connect an Anthropic API key. Then, only for the
*ambiguous* cases the rules aren't confident about, LifeHQ asks Claude to make the call. Your key is
stored **encrypted** on your device (via Electron `safeStorage`). AI is off until you add a key.

## Running it

```bash
npm install        # already done
npm run dev        # develop with hot reload
npm run start      # run the built app (production preview)
npm run build      # type-bundle all three processes
npm run icon       # regenerate build/icon.ico + build/icon.png
npm run package    # build the Windows installer (.exe) into /dist
```

The first run creates your vault at `Documents/LifeHQ Vault`. You can move it in Settings.

## Installing it like a normal app

After `npm run package`, double-click **`dist/LifeHQ-Setup-0.1.0.exe`**. It installs LifeHQ,
creates Desktop + Start-menu shortcuts (with the LifeHQ icon), and registers an uninstaller.
Because the build isn't code-signed, Windows SmartScreen may warn on first run — click
**More info → Run anyway** (one time).

Prefer not to install? `dist/win-unpacked/LifeHQ.exe` is a standalone executable you can run or
make a shortcut to directly.

### Packaging note (Windows)
electron-builder unpacks a code-signing bundle that contains macOS symlinks, which Windows blocks
unless **Developer Mode** is on or the shell is elevated. Two ways to handle it:

1. Turn on **Settings → Privacy & security → For developers → Developer Mode**, then `npm run package`.
2. Pre-extract the bundle without the macOS files (one-time; it then stays cached):
   ```powershell
   $c = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   & .\node_modules\7zip-bin\win\x64\7za.exe x "$c\<any>.7z" "-o$c\winCodeSign-2.6.0" "-xr!darwin" -y
   $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npx electron-builder --win
   ```

## Auto-updates & releasing

LifeHQ auto-updates from GitHub Releases (repo:
[joaobarcos18-netizen/lifehq](https://github.com/joaobarcos18-netizen/lifehq)). The installed app
checks for a newer version on startup and, when one is downloaded, offers **Restart now** to apply
it. Your vault/data is never touched.

To ship an update:

1. Bump the version in `package.json` (e.g. `0.1.0` → `0.1.1`).
2. Make sure `gh` is authenticated, then:
   ```powershell
   $env:GH_TOKEN = (gh auth token); $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm run release
   ```
   This builds and publishes a new GitHub Release with the installer + `latest.yml`.
3. Installed apps pick it up automatically on their next launch.

(The dev launcher — the Desktop/Start shortcut — always runs the local build, so it doesn't need
releases; just rebuild and reopen.)

## Tech

- **Electron** + **React** + **TypeScript**, bundled with **electron-vite**.
- **Three.js** for the 3D photo world.
- **Tailwind CSS** for the UI; **Recharts** for charts.
- Data is a human-readable JSON store inside your vault (`lifehq-db.json`); files & photos are copied
  into `vault/files/<category>/` and `vault/photos/`.
- A custom `lifehq://` protocol serves vault images to the UI.

## Project layout

```
src/
  shared/types.ts        # single source of truth: domain types + IPC contract
  main/                  # Electron main process
    index.ts             # window + lifehq:// protocol
    ipc.ts               # every backend operation
    store/               # JSON db + config (incl. encrypted API key)
    services/            # vault (file storage), classifier (sorting brain), ai, csv import
  preload/index.ts       # typed window.api bridge
  renderer/src/
    App.tsx              # sidebar + routing
    components/          # design system (ui.tsx, Modal)
    lib/                 # ipc client, formatters, icons, hooks
    modules/             # one folder per module
```

## Ideas for later

- Auto-updates (electron-updater) + code-signing to remove the SmartScreen warning.
- Terrain-style "digging" downward in Photo World to bury memories below ground level.
- Savings goals in the Goals module fed by detected recurring spend.
- Global quick-add / command palette (Ctrl+K).
- Whole-vault backup & restore from Settings.
