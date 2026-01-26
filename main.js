require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8000;
// Check for common typos in environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKE || process.env.TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// Global status variable for debugging
let botStatus = "STARTING";
let lastError = null;

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// --- EXPRESS APP SETUP ---
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- HEALTH / DEBUG ENDPOINT ---
app.get('/', (req, res) => {
    const isReady = client.isReady();
    const tokenStatus = DISCORD_TOKEN ? `Loaded (${DISCORD_TOKEN.substring(0, 5)}...)` : "MISSING (Check Env Vars)";
    
    res.send(`
        <h1>Bot Status: ${isReady ? 'ONLINE ✅' : 'OFFLINE ❌'}</h1>
        <p><strong>Current State:</strong> ${botStatus}</p>
        <p><strong>Token Status:</strong> ${tokenStatus}</p>
        <p><strong>Last Error:</strong> ${lastError || 'None'}</p>
        <hr>
        <p><em>If "Token Status" says MISSING, check your Koyeb Environment Variables. It must be named <code>DISCORD_TOKEN</code>.</em></p>
    `);
});

// --- API ROUTES ---

app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // IF BOT IS OFFLINE: Don't send 503. Send a "fake" channel with the error message
    // so the dashboard loads and you can see what is wrong.
    if (!client.isReady()) {
        console.log(`[API] Bot offline. Status: ${botStatus}`);
        return res.json([{
            id: 'error',
            name: `❌ BOT OFFLINE: ${botStatus} (Check / for details)`
        }]);
    }

    try {
        const channels = [];
        // Force fetch if cache is empty
        if (client.guilds.cache.size === 0) await client.guilds.fetch();

        client.guilds.cache.forEach(guild => {
            if (!guild) return;
            guild.channels.cache.forEach(channel => {
                if (channel && channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(client.user)?.has('SendMessages')) {
                    channels.push({
                        id: channel.id,
                        name: `${guild.name} - #${channel.name}`
                    });
                }
            });
        });
        
        channels.sort((a, b) => a.name.localeCompare(b.name));
        res.json(channels);
    } catch (error) {
        console.error("Error fetching channels:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const authHeader = req.headers.authorization;
    const { channelId, title } = req.body;
    const files = req.files;

    const cleanupFiles = (f) => { if (f) f.forEach(file => fs.unlink(file.path, () => {})); };

    if (authHeader !== DASHBOARD_PASSWORD) {
        cleanupFiles(files);
        return res.status(401).json({ error: 'Wrong Password' });
    }

    if (!client.isReady()) {
        cleanupFiles(files);
        return res.status(503).json({ error: `Bot Offline: ${botStatus}` });
    }

    res.json({ success: true, message: 'Upload received! Processing...' });

    (async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            const attachments = files.map(file => ({
                attachment: file.path,
                name: file.originalname
            }));

            await channel.send({
                content: `**${title || 'New Video Upload'}**`,
                files: attachments
            });
            console.log(`Successfully sent videos to ${channel.name}`);
        } catch (error) {
            console.error('Background Upload Failed:', error);
        } finally {
            cleanupFiles(files);
        }
    })();
});

// --- LOGIN LOGIC ---
const startBot = async () => {
    if (!DISCORD_TOKEN) {
        botStatus = "CRITICAL: DISCORD_TOKEN is missing in Env Vars";
        console.error(botStatus);
        return;
    }

    try {
        botStatus = "Logging in...";
        console.log(botStatus);
        await client.login(DISCORD_TOKEN);
        botStatus = "Ready";
        lastError = null;
    } catch (error) {
        botStatus = "Login Failed (Retrying in 10s)";
        lastError = error.message;
        console.error("Login Error:", error);
        setTimeout(startBot, 10000);
    }
};

client.once('ready', () => {
    botStatus = "Ready";
    console.log(`Discord Bot logged in as ${client.user.tag}`);
});

client.on('error', (err) => {
    console.error("Client Error:", err);
    lastError = err.message;
});

// --- SERVER START ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
