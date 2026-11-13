import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");
const dataDir = path.resolve(__dirname, "../data");
const catalogueFile = path.join(dataDir, "catalog.json");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(catalogueFile)) fs.writeFileSync(catalogueFile, "[]");

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json());

const MAX_FILE_SIZE = 300 * 1024 * 1024; // demo limit: 300 MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).slice(0, 12)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Demo: reject obvious web/script files. Production requires malware scanning and stricter policy.
    const ext = path.extname(file.originalname).toLowerCase();
    const blocked = [".js", ".vbs", ".bat", ".cmd", ".ps1", ".sh", ".scr"];
    if (blocked.includes(ext)) return cb(new Error("This file type is not accepted."));
    cb(null, true);
  }
});

function readItems() { return JSON.parse(fs.readFileSync(catalogueFile, "utf8")); }
function writeItems(items) { fs.writeFileSync(catalogueFile, JSON.stringify(items, null, 2)); }

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/items", (_req, res) => {
  const items = readItems().filter(x => x.status === "approved").map(({ storedName, ...safe }) => ({
    ...safe, downloadUrl: `/api/download/${safe.id}`
  }));
  res.json(items);
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Please choose a file." });
  const { name, category, version, description } = req.body;
  if (!name?.trim() || !description?.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Title and description are required." });
  }
  const item = {
    id: crypto.randomUUID(), name: name.trim().slice(0,80),
    category: category === "Software" ? "Software" : "Game",
    version: (version || "1.0").slice(0,20), description: description.trim().slice(0,500),
    size: `${(req.file.size / 1024 / 1024).toFixed(1)} MB`,
    originalName: path.basename(req.file.originalname), storedName: req.file.filename,
    status: "pending", uploadedAt: new Date().toISOString(), downloads: 0
  };
  const items = readItems(); items.push(item); writeItems(items);
  res.status(201).json({ ok: true, id: item.id, status: item.status });
});

// DEMO ONLY: no authentication. Never expose this endpoint publicly.
app.get("/api/demo/pending", (_req, res) => res.json(readItems().filter(x => x.status === "pending")));
app.post("/api/demo/approve/:id", (req, res) => {
  const items = readItems();
  const item = items.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  item.status = "approved"; writeItems(items); res.json({ ok: true });
});
app.get("/api/download/:id", (req, res) => {
  const items = readItems();
  const item = items.find(x => x.id === req.params.id && x.status === "approved");
  if (!item) return res.status(404).json({ error: "File not found" });
  const filePath = path.join(uploadsDir, item.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing" });
  item.downloads = (item.downloads || 0) + 1; writeItems(items);
  res.download(filePath, item.originalName);
});
app.use((err, _req, res, _next) => res.status(400).json({ error: err.message || "Upload error" }));

const port = process.env.PORT || 4000;
app.listen(port, "127.0.0.1", () => console.log(`GameHub API listening on http://localhost:${port}`));
