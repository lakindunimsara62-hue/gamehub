
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("node:crypto");

let apiServer;

function startApi() {
  const userData = app.getPath("userData");
  const uploadsDir = path.join(userData, "uploads");
  const dataDir = path.join(userData, "data");
  const catalogueFile = path.join(dataDir, "catalog.json");
  const adminFile = path.join(dataDir, "admin.json");

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(catalogueFile)) {
    fs.writeFileSync(catalogueFile, "[]");
  }

  const server = express();
  server.use(cors({ origin: true }));
  server.use(express.json({ limit: "1mb" }));

  const adminTokens = new Set();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).slice(0, 12)}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 300 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const blocked = [".js", ".vbs", ".bat", ".cmd", ".ps1", ".sh", ".scr"];

      if (blocked.includes(ext)) {
        return cb(new Error("This file type is not accepted."));
      }

      cb(null, true);
    }
  });

  const readItems = () =>
    JSON.parse(fs.readFileSync(catalogueFile, "utf8"));

  const writeItems = items =>
    fs.writeFileSync(catalogueFile, JSON.stringify(items, null, 2));

  function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : "";

    if (!token || !adminTokens.has(token)) {
      return res.status(401).json({ error: "Admin login required." });
    }

    next();
  }

  server.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Public approved catalogue
  server.get("/api/items", (_req, res) => {
    res.json(
      readItems()
        .filter(x => x.status === "approved")
        .map(({ storedName, ...safe }) => ({
          ...safe,
          downloadUrl: `/api/download/${safe.id}`
        }))
    );
  });

  // Admin password status
  server.get("/api/admin/status", (_req, res) => {
    res.json({ configured: fs.existsSync(adminFile) });
  });

  // First-time admin password setup
  server.post("/api/admin/setup", (req, res) => {
    if (fs.existsSync(adminFile)) {
      return res.status(409).json({
        error: "Admin password has already been set."
      });
    }

    const password = req.body?.password;

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters."
      });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");

    fs.writeFileSync(
      adminFile,
      JSON.stringify({ salt, hash }, null, 2)
    );

    res.json({ ok: true });
  });

  // Admin login
  server.post("/api/admin/login", (req, res) => {
    if (!fs.existsSync(adminFile)) {
      return res.status(400).json({
        error: "Please set up the admin password first."
      });
    }

    const password = req.body?.password;

    if (typeof password !== "string") {
      return res.status(400).json({ error: "Enter your password." });
    }

    const saved = JSON.parse(fs.readFileSync(adminFile, "utf8"));
    const hash = crypto.scryptSync(password, saved.salt, 64);
    const expected = Buffer.from(saved.hash, "hex");

    if (
      hash.length !== expected.length ||
      !crypto.timingSafeEqual(hash, expected)
    ) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    adminTokens.add(token);

    res.json({ ok: true, token });
  });

  // Admin pending uploads
  server.get("/api/admin/pending", requireAdmin, (_req, res) => {
    res.json(readItems().filter(x => x.status === "pending"));
  });

  // Approve pending upload
  server.post("/api/admin/approve/:id", requireAdmin, (req, res) => {
    const items = readItems();
    const item = items.find(
      x => x.id === req.params.id && x.status === "pending"
    );

    if (!item) {
      return res.status(404).json({ error: "Pending upload not found." });
    }

    item.status = "approved";
    writeItems(items);

    res.json({ ok: true });
  });

  // Reject pending upload and delete its file
  server.post("/api/admin/reject/:id", requireAdmin, (req, res) => {
    const items = readItems();
    const index = items.findIndex(
      x => x.id === req.params.id && x.status === "pending"
    );

    if (index === -1) {
      return res.status(404).json({ error: "Pending upload not found." });
    }

    const item = items[index];
    const filePath = path.join(uploadsDir, path.basename(item.storedName));

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    items.splice(index, 1);
    writeItems(items);

    res.json({ ok: true });
  });

  // Delete approved upload and its stored file
  server.delete("/api/admin/delete/:id", requireAdmin, (req, res) => {
    const items = readItems();
    const index = items.findIndex(
      x => x.id === req.params.id && x.status === "approved"
    );

    if (index === -1) {
      return res.status(404).json({
        error: "Approved file not found."
      });
    }

    const item = items[index];
    const filePath = path.join(uploadsDir, path.basename(item.storedName));

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    items.splice(index, 1);
    writeItems(items);

    res.json({ ok: true });
  });

  // Upload new file
  server.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Please choose a file." });
    }

    const { name, category, version, description } = req.body;

    if (!name?.trim() || !description?.trim()) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "Title and description are required."
      });
    }

    const item = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      category: category === "Software" ? "Software" : "Game",
      version: (version || "1.0").slice(0, 20),
      description: description.trim().slice(0, 500),
      size: `${(req.file.size / 1024 / 1024).toFixed(1)} MB`,
      originalName: path.basename(req.file.originalname),
      storedName: req.file.filename,
      status: "pending",
      uploadedAt: new Date().toISOString(),
      downloads: 0
    };

    const items = readItems();
    items.push(item);
    writeItems(items);

    res.status(201).json({
      ok: true,
      id: item.id,
      status: item.status
    });
  });

  // Download approved file
  server.get("/api/download/:id", (req, res) => {
    const items = readItems();
    const item = items.find(
      x => x.id === req.params.id && x.status === "approved"
    );

    if (!item) {
      return res.status(404).json({ error: "File not found." });
    }

    const filePath = path.join(
      uploadsDir,
      path.basename(item.storedName)
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File missing." });
    }

    item.downloads = (item.downloads || 0) + 1;
    writeItems(items);

    res.download(filePath, item.originalName);
  });

  server.use((err, _req, res, _next) => {
    res.status(400).json({
      error: err.message || "Upload error."
    });
  });

  return new Promise((resolve, reject) => {
    const listener = server.listen(4000, "127.0.0.1", () => {
      resolve(listener);
    });

    listener.on("error", reject);
  });
}

async function createWindow() {
  apiServer = await startApi();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const frontendPath = path.join(
    process.resourcesPath,
    "web",
    "dist",
    "index.html"
  );

  console.log("Frontend path:", frontendPath);
  console.log("Frontend exists:", fs.existsSync(frontendPath));

  await win.loadFile(frontendPath);
}

app.whenReady().then(createWindow).catch(error => {
  console.error("GameHub startup error:", error);
  app.quit();
});

app.on("before-quit", () => {
  if (apiServer) apiServer.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
