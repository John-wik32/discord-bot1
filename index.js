const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.use(cors());
app.use(express.json());

// FIX: Strictly define the public folder path
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// FIX: Force the root to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Health check for Koyeb
app.get('/health', (req, res) => res.status(200).send('OK'));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Auth Middleware
const checkAuth = (req, res, next) => {
    if (req.headers['authorization'] !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Wrong Password' });
    }
    next();
};

app.get('/api/channels', checkAuth, async (req, res) => {
    const channels = [];
    client.guilds.cache.forEach(guild => {
        guild.channels.cache
            .filter(ch => ch.type === 0) 
            .forEach(ch => channels.push({ id: ch.id, name: `${guild.name} - #${ch.name}` }));
    });
    res.json(channels);
});

app.post('/api/post', checkAuth, upload.single('mediaFile'), async (req, res) => {
    try {
        const { channelId, postTitle } = req.body;
        const channel = await client.channels.fetch(channelId);
        const options = { content: postTitle || "" };
        if (req.file) {
            options.files = [new AttachmentBuilder(req.file.buffer, { name: req.file.originalname })];
        }
        await channel.send(options);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

client.once('ready', () => console.log(`✅ Bot Online: ${client.user.tag}`));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
client.login(DISCORD_TOKEN);
