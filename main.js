require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// Minimum possible intents to ensure startup
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Root route for health check
app.get('/', (req, res) => {
    res.send(`System Status: ${client.ws.status === 0 ? 'Connected' : 'Connecting...'}`);
});

// --- API CHANNELS ---
app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Bypass strict ready check to prevent 503 loop
    try {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                if (channel.type === ChannelType.GuildText) {
                    channels.push({ id: channel.id, name: `${guild.name} - #${channel.name}` });
                }
            });
        });

        // If cache is empty but client is "connected", try a fetch
        if (channels.length === 0 && client.ws.status === 0) {
            return res.status(503).json({ error: 'Bot connected but loading servers... wait 5s.' });
        }

        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- API SEND ---
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const { channelId, title, description, mention } = req.body;
    const files = req.files;
    const cleanup = (f) => { if (f) f.forEach(x => fs.unlink(x.path, () => {})); };

    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        cleanup(files);
        return res.status(401).send('Unauthorized');
    }

    res.json({ success: true });

    (async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            let contentText = `**${title}**`;
            if (mention === 'everyone') contentText = `@everyone\n${contentText}`;
            else if (mention === 'here') contentText = `@here\n${contentText}`;
            if (description) contentText += `\n${description}`;

            await channel.send({
                content: contentText,
                files: files.map(f => ({ attachment: f.path, name: f.originalname }))
            });
        } catch (e) {
            console.error("Post Error:", e);
        } finally {
            cleanup(files);
        }
    })();
});

// --- BOT STARTUP & ERROR LOGGING ---
client.on('ready', () => console.log(`SUCCESS: Logged in as ${client.user.tag}`));

client.on('error', err => console.error('DISCORD ERROR:', err));

client.login(DISCORD_TOKEN).catch(err => {
    console.error('FATAL LOGIN ERROR:', err.message);
    if (err.message.includes('privileges')) {
        console.error('ACTION REQUIRED: Enable "Message Content Intent" in Discord Developer Portal.');
    }
});

app.listen(PORT, () => console.log(`Dashboard on port ${PORT}`));
