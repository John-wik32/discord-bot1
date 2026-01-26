require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8000;
// Support multiple variable names just in case
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKE || process.env.TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// --- LOGGING SYSTEM (Captures logs to show in Browser) ---
const appLogs = [];
function logToBrowser(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] [${type}] ${message}`;
    console.log(entry); // Keep sending to server console
    appLogs.unshift(entry); // Add to start of array for browser
    if (appLogs.length > 50) appLogs.pop(); // Keep last 50 lines
}

// --- DISCORD CLIENT ---
// We start with MINIMAL intents to rule out permission errors
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// --- EXPRESS APP ---
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- 1. THE DIAGNOSTIC DASHBOARD (ROOT URL) ---
app.get('/', (req, res) => {
    const isReady = client.isReady();
    const tokenPreview = DISCORD_TOKEN ? `${DISCORD_TOKEN.substring(0, 5)}...` : "❌ NOT FOUND";
    
    // Check if token looks weird (common copy-paste issues)
    let tokenWarning = "";
    if (DISCORD_TOKEN && DISCORD_TOKEN.includes(" ")) tokenWarning = "⚠️ WARNING: Token contains spaces!";
    if (DISCORD_TOKEN && DISCORD_TOKEN.length < 50) tokenWarning = "⚠️ WARNING: Token looks too short!";

    const html = `
    <html>
    <head><title>Bot Diagnostics</title>
    <meta http-equiv="refresh" content="5"> <style>
        body { font-family: monospace; background: #111; color: #eee; padding: 20px; }
        .box { background: #222; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #444; }
        .status-ok { color: #5f5; font-weight: bold; }
        .status-bad { color: #f55; font-weight: bold; }
        .log-entry { border-bottom: 1px solid #333; padding: 4px 0; }
        .log-error { color: #f88; }
    </style>
    </head>
    <body>
        <h1>🔧 Bot Diagnostics Mode</h1>
        
        <div class="box">
            <p>Bot Status: <span class="${isReady ? 'status-ok' : 'status-bad'}">${isReady ? 'ONLINE ✅' : 'OFFLINE ❌'}</span></p>
            <p>Web Server: <span class="status-ok">Running (Port ${PORT})</span></p>
            <p>Token Loaded: ${tokenPreview} <span style="color:yellow">${tokenWarning}</span></p>
            ${!isReady ? '<p style="color:cyan">⏳ Waiting for Discord connection...</p>' : ''}
        </div>

        <h3>📝 Live System Logs (Auto-refreshes)</h3>
        <div class="box">
            ${appLogs.map(l => `<div class="log-entry ${l.includes('[ERROR]') ? 'log-error' : ''}">${l}</div>`).join('')}
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

// --- API ROUTES ---
app.get('/api/channels', async (req, res) => {
    // If offline, return empty list instead of 503 to prevent frontend crash
    if (!client.isReady()) {
        return res.json([{ id: '0', name: '❌ BOT IS OFFLINE - CHECK DIAGNOSTICS PAGE' }]);
    }
    
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                if (channel.type === ChannelType.GuildText) {
                    channels.push({ id: channel.id, name: `${guild.name} - #${channel.name}` });
                }
            });
        });
        res.json(channels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/send', upload.array('videos', 5), (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Wrong Password' });
    if (!client.isReady()) return res.status(503).json({ error: 'Bot Offline' });

    res.json({ success: true, message: 'Processing...' });
    
    // Simplified Send Logic
    (async () => {
        try {
            const channel = await client.channels.fetch(req.body.channelId);
            const attachments = req.files.map(f => ({ attachment: f.path, name: f.originalname }));
            await channel.send({ content: `**${req.body.title}**`, files: attachments });
            logToBrowser("INFO", `Sent video to ${channel.name}`);
        } catch (e) {
            logToBrowser("ERROR", `Upload failed: ${e.message}`);
        }
    })();
});

// --- STARTUP LOGIC ---
client.on('ready', () => logToBrowser("SUCCESS", `Logged in as ${client.user.tag}!`));
client.on('error', (err) => logToBrowser("ERROR", `Client Error: ${err.message}`));

async function start() {
    logToBrowser("INFO", "Server starting...");
    
    if (!DISCORD_TOKEN) {
        logToBrowser("ERROR", "CRITICAL: NO TOKEN FOUND IN ENV VARS");
        return;
    }

    try {
        logToBrowser("INFO", "Attempting Discord Login...");
        await client.login(DISCORD_TOKEN);
    } catch (e) {
        logToBrowser("ERROR", `LOGIN FAILED: ${e.message}`);
        if (e.message.includes("DisallowedIntents")) {
            logToBrowser("ERROR", "SOLUTION: Go to Discord Dev Portal -> Bot -> Enable 'Server Members Intent'");
        } else if (e.code === 'TokenInvalid') {
            logToBrowser("ERROR", "SOLUTION: Your Token is invalid. Update it in Koyeb Settings.");
        }
    }
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    start();
});
