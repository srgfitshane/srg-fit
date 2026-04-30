# SRG Fit Coach (desktop)

Tiny Tauri 2 + Vite + React window that surfaces the same "Today's
Coaching" inbox as `/dashboard/coach`. Polls every 60 seconds.
Clicking an item opens the matching `srgfit.app` page in your default
browser (so it lands in your real Chrome session with cookies).

Single source of truth: imports `buildCoachInbox` from
`../src/lib/coach-inbox.ts`. Any change to the queue rules or sources
updates both web and desktop.

## One-time setup

1. **Install Rust** (Tauri's backend) — https://rustup.rs/. Reboot
   after install so PATH picks up `cargo`.

2. **Install Microsoft Edge WebView2** — already on Windows 11.
   Tauri uses it as the embedded webview.

3. **Add env vars**:
   ```
   cp desktop/.env.local.example desktop/.env.local
   ```
   Fill in `VITE_SUPABASE_ANON_KEY` from your Supabase project's
   API settings (the same anon key the web app uses; safe for
   client-side because RLS protects every table).

4. **Add icons**. The MSI bundler needs an `icon.ico` plus 32x32 +
   128x128 PNGs. Easiest:
   ```
   cd desktop
   npx @tauri-apps/cli icon path/to/source.png
   ```
   This generates the full set into `src-tauri/icons/`.

5. **Install JS deps**:
   ```
   cd desktop
   npm install
   ```

## Dev loop

```
cd desktop
npm run dev
```

First launch downloads + compiles Rust deps (a few minutes). After
that, edits to the React code hot-reload through Vite + Tauri
without restarting the binary.

## Build a Windows installer

```
cd desktop
npm run build
```

Produces an MSI at:
```
desktop/src-tauri/target/release/bundle/msi/SRG Fit Coach_0.1.0_x64_en-US.msi
```

Double-click to install. The app then launches from the Start menu
as **SRG Fit Coach**.

## Reset the persisted session

If you get locked out (expired refresh token, switched accounts),
clear the WebView2 storage for this app:

```
%LOCALAPPDATA%\app.srgfit.coach\EBWebView
```

Delete that folder, relaunch the app, sign in again.

## Architecture

```
desktop/
├── src/                       # React frontend (Vite-bundled into the webview)
│   ├── App.tsx                # auth gate -> LoginScreen | InboxView
│   ├── InboxView.tsx          # 60s polling, queue render, click -> openUrl
│   ├── LoginScreen.tsx        # email + password sign-in
│   ├── supabase.ts            # createClient with VITE_SUPABASE_* env
│   └── theme.ts               # SemanticColor -> hex map (dark only)
└── src-tauri/                 # Rust shell
    ├── Cargo.toml
    ├── tauri.conf.json        # window 480x720, MSI bundle target
    ├── capabilities/default.json   # opener:allow-open-url for srgfit.app/**
    └── src/
        ├── main.rs            # binary entry, calls lib::run()
        └── lib.rs             # tauri::Builder + opener plugin
```

The desktop app reaches into `../src/lib/coach-inbox.ts` directly via
`tsconfig.include`. No build-time copy, no version drift.

## What it deliberately does NOT do

- **No tray/menubar icon.** Plain windowed app per the design choice.
- **No native push.** Polling at 60 s. Web Push on the browser
  side is the notification channel.
- **No Realtime subscriptions.** Polling is simpler and the cadence is fine.
- **No code signing / auto-update.** Personal binary on your machine.
- **No multi-coach support.** Whoever signs in is the coach.
