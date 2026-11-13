# GameHub — Windows 10/11 starter

This is a starter project for a game/software download platform:
- `apps/web`: React + Vite website
- `apps/desktop`: Electron Windows desktop launcher
- `apps/api`: Express API with local file storage and a small JSON catalogue

## Requirements
- Node.js 20+
- npm
- Windows 10 or Windows 11 for building/testing the desktop installer

## Run locally
Open a terminal in this folder and install dependencies:

```bash
npm install
```

Start the API and website:

```bash
npm run dev
```

Website: http://localhost:5173  
API: http://localhost:4000

Start the desktop launcher in another terminal:

```bash
npm run desktop
```

The desktop app loads the same React interface at `http://localhost:5173` during development.

## Build a Windows installer
```bash
npm run build
npm run dist:win
```
The installer output will be created in `apps/desktop/dist`.

## Important before public launch
This is a development MVP, not a production-ready public service. Before allowing public uploads:
1. Add real user accounts and role-based admin authentication.
2. Store files in private cloud object storage (not on the web server disk).
3. Add antivirus/malware scanning and file-type/size limits.
4. Keep uploads private until an admin approves them.
5. Add copyright reporting/takedown handling and clear upload rules.
6. Add rate limits, audit logs, backups, HTTPS, and secure secrets.
7. Never run uploaded executables automatically. Users must choose to download and run software themselves.

The demo API currently uses a simple local JSON catalogue and local disk storage. Its demo admin approval endpoint is intentionally not protected; do not expose it to the internet.
