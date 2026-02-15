const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const multer = require("multer");

const pool = require("./database");

// ======================================================
// APP CONFI
// ======================================================

const app = express();
const port = 3001;

// Ensure all paths are absolute and inside your app folder
const RAW_FILE = path.join(__dirname, "data/rawValue.json");
const MAIN_FILE = path.join(__dirname, "data/mainRaw.json");
const OPTIONS_FILE = path.join(__dirname, "data/options.json");
const FILES_DIR = path.join(__dirname, "files");


// Middleware
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// PERS STATE INIT
// ======================================================

// ---- rawValue ----
let rawValue = 0;
if (fs.existsSync(RAW_FILE)) {
    try {
        rawValue = parseInt(fs.readFileSync(RAW_FILE, "utf8")) || 0;
    } catch {
        rawValue = 0;
    }
}

// ---- mainContent ----
let mainContent = "";
if (fs.existsSync(MAIN_FILE)) {
    try {
        mainContent = fs.readFileSync(MAIN_FILE, "utf8");
    } catch {
        mainContent = "";
    }
}

// ---- OPTIONS ----
let OPTIONS = [];

function loadOptions() {
    if (fs.existsSync(OPTIONS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(OPTIONS_FILE, "utf8"));
        } catch {
            return [];
        }
    }

    const defaults = [
        { id: 1, label: "Option 1", content: "" },
        { id: 2, label: "Option 2", content: "" },
        { id: 3, label: "Option 3", content: "" },
        { id: 4, label: "Option 4", content: "" }
    ];

    fs.writeFileSync(OPTIONS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
}

OPTIONS = loadOptions();

function saveOptions() {
    fs.writeFileSync(OPTIONS_FILE, JSON.stringify(OPTIONS, null, 2));
}

// ======================================================
// AUTH & SESSION MANAGEMENT
// ======================================================

const SESSIONS = {};
const FAILED_LOGINS = {};

const MAX_ATTEMPTS = 5;
const LOCK_TIME = 10 * 60 * 1000; // 10 minutes

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

function trackFailedLogin(username) {
    if (!FAILED_LOGINS[username]) {
        FAILED_LOGINS[username] = { count: 0, lastAttempt: Date.now() };
    }
    FAILED_LOGINS[username].count++;
    FAILED_LOGINS[username].lastAttempt = Date.now();
}

// ---- Middleware ----

function requireLogin(req, res, next) {
    const token = req.cookies?.auth;
    if (token && SESSIONS[token]) {
        req.user = SESSIONS[token];
        return next();
    }
    res.status(401).send("Unauthorized");
}

function requireModeratorOrAdmin(req, res, next) {
    if (req.user?.role === "admin" || req.user?.role === "moderator") {
        return next();
    }
    res.status(403).send("Forbidden");
}

function requireAdmin(req, res, next) {
    if (req.user?.role === "admin") {
        return next();
    }
    res.status(403).send("Forbidden");
}

// ======================================================
// AUTH ROUTES
// ======================================================

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const failed = FAILED_LOGINS[username];

    if (failed &&
        failed.count >= MAX_ATTEMPTS &&
        Date.now() - failed.lastAttempt < LOCK_TIME) {
        return res.status(429).json({
            success: false,
            message: "Too many failed attempts. Try again later."
        });
    }

    try {
        const [rows] = await pool.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (!rows.length) {
            trackFailedLogin(username);
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid) {
            trackFailedLogin(username);
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        delete FAILED_LOGINS[username];

        const token = generateToken();
        SESSIONS[token] = {
            username: user.username,
            role: user.role
        };

        res.cookie("auth", token, {
            httpOnly: true,
            sameSite: "strict",
            secure: false,
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({ success: true, role: user.role });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.get("/logout", (req, res) => {
    const token = req.cookies?.auth;
    if (token) delete SESSIONS[token];

    res.clearCookie("auth");
    res.redirect("/");
});

app.get("/me", requireLogin, (req, res) => {
    res.json(req.user);
});

// ======================================================
// PAGE ROUTES
// ======================================================

app.get("/options", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public/options.html"));
});

app.get("/edit/:opt", requireLogin, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "public/edit.html"));
});

app.get("/download", requireLogin, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "public/download.html"));
});

// ======================================================
// RAW VALUE API
// ======================================================

app.get("/api/raw", (req, res) => {
    res.type("text/plain").send(rawValue.toString());
});

app.post("/api/raw", requireLogin, requireAdmin, (req, res) => {
    const { value } = req.body;
    const validValues = OPTIONS.map(o => o.id);

    if (!validValues.includes(value)) {
        return res.status(400).send("Invalid value");
    }

    rawValue = value;

    try {
        fs.writeFileSync(RAW_FILE, rawValue.toString());
        res.send(rawValue.toString());
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to save");
    }
});

// ======================================================
// MAIN CONTENT API
// ======================================================

app.get("/api/main", (req, res) => {
    res.type("text/plain").send(mainContent);
});

app.post("/api/main", requireLogin, requireAdmin, (req, res) => {
    const { content } = req.body;

    if (typeof content !== "string") {
        return res.status(400).send("Invalid content");
    }

    mainContent = content;

    try {
        fs.writeFileSync(MAIN_FILE, mainContent);
        res.send("ok");
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to save");
    }
});

// ======================================================
// OPTIONS MANAGEMENT
// ======================================================

app.get("/options-list", requireLogin, (req, res) => {
    res.json(OPTIONS);
});

app.post("/options", requireLogin, requireAdmin, (req, res) => {
    const { label } = req.body;
    if (!label || typeof label !== "string") {
        return res.status(400).json({ error: "Invalid label" });
    }

    const newId = OPTIONS.length
        ? Math.max(...OPTIONS.map(o => o.id)) + 1
        : 1;

    const newOption = { id: newId, label, content: "" };
    OPTIONS.push(newOption);
    saveOptions();

    res.json(newOption);
});

app.delete("/options/:id", requireLogin, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = OPTIONS.findIndex(o => o.id === id);

    if (index === -1) {
        return res.status(404).json({ error: "Option not found" });
    }

    OPTIONS.splice(index, 1);
    saveOptions();

    if (rawValue === id) {
        rawValue = 0;
        fs.writeFileSync(RAW_FILE, "0");
    }

    res.json({ success: true });
});

// Option content endpoints
app.get("/api/:opt", requireLogin, requireModeratorOrAdmin, (req, res) => {
    const optId = parseInt(req.params.opt.replace("opt", ""));
    const option = OPTIONS.find(o => o.id === optId);

    if (!option) return res.status(404).send("Not found");

    res.type("text/plain").send(option.content || "");
});

app.post("/api/:opt", requireLogin, requireAdmin, (req, res) => {
    const optId = parseInt(req.params.opt.replace("opt", ""));
    const option = OPTIONS.find(o => o.id === optId);

    if (!option) return res.status(400).send("Invalid option");

    const { content } = req.body;
    if (typeof content !== "string") {
        return res.status(400).send("Invalid content");
    }

    option.content = content;
    saveOptions();

    res.send("ok");
});

// ======================================================
// FILE UPLOAD, DOWNLOAD & REMOVAL
// ======================================================

const upload = multer({
    dest: FILES_DIR,
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Upload
app.post("/upload", requireLogin, requireAdmin, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).send("No file uploaded");

    const targetPath = path.join(FILES_DIR, req.file.originalname);

    fs.rename(req.file.path, targetPath, err => {
        if (err) return res.status(500).send("Failed to save file");
        res.send("File uploaded successfully");
    });
});

// JSON downloads
app.get("/download/raw", requireLogin, requireModeratorOrAdmin,
    (req, res) => res.download(path.join(__dirname, RAW_FILE)));

app.get("/download/main", requireLogin, requireModeratorOrAdmin,
    (req, res) => res.download(path.join(__dirname, MAIN_FILE)));

app.get("/download/options", requireLogin, requireModeratorOrAdmin,
    (req, res) => res.download(path.join(__dirname, OPTIONS_FILE)));

app.get("/download/backup", requireLogin, requireModeratorOrAdmin, (req, res) => {
    const backup = { rawValue, mainContent, options: OPTIONS };

    res.setHeader("Content-Disposition", "attachment; filename=backup.json");
    res.json(backup);
});

// Dynamic file list
app.get("/download/list", requireLogin, requireModeratorOrAdmin, (req, res) => {
    fs.readdir(FILES_DIR, { withFileTypes: true }, (err, entries) => {
        if (err) return res.status(500).send("Error reading directory");

        const files = entries
            .filter(e => e.isFile())
            .map(e => e.name);

        res.json(files);
    });
});

app.get("/download/file/:name", requireLogin, requireModeratorOrAdmin, (req, res) => {
    const filePath = path.join(FILES_DIR, req.params.name);

    if (!filePath.startsWith(FILES_DIR)) {
        return res.status(400).send("Invalid file path");
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }

    res.download(filePath);
});

app.delete("/delete/:name", requireLogin, requireAdmin, (req, res) => {
    const filename = req.params.name;

    // Prevent directory traversal attacks
    const filePath = path.join(FILES_DIR, filename);
    if (!filePath.startsWith(FILES_DIR)) {
        return res.status(400).send("Invalid file path");
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }

    // Delete file
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error("Delete error:", err);
            return res.status(500).send("Failed to delete file");
        }
        res.send("File deleted successfully");
    });
});

// ======================================================
// SERVER START
// ======================================================

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
