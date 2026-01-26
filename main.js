require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const app = express();

// SECURITY: Only allow video files
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Only video files are allowed!'), false);
    }
};

const upload = multer({ dest: 'uploads/', fileFilter: fileFilter });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Keep Alive & Status
app.get('/', (req, res) => res.send(`Bot Status: ${client.isReady() ? 'ONLINE ✅' : 'CONNECTING ⏳'}`));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- ROUTES ---

// 1. Get Channels
app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!client.isReady()) return res.status(503).json({ error: 'Bot waking up...' });

    const channels = [];
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(channel => {
            if (channel.type === ChannelType.GuildText && channel.permissionsFor(client.user)?.has('SendMessages')) {
                channels.push({ id: channel.id, name: `${guild.name} - #${channel.name}` });
            }
        });
    });
    res.json(channels);
});

// 2. Send Video (With Mentions, Description, Reactions)
app.post('/api/send', upload.array('videos', 5), (req, res) => {
    const { channelId, title, description, mention } = req.body;
    const files = req.files;
    
    // Safety cleanup function
    const cleanup = (f) => { if (f) f.forEach(file => fs.unlink(file.path, () => {})); };

    if (req.headers.authorization !== DASHBOARD_PASSWORD) {
        cleanup(files);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Immediate success response
    res.json({ success: true, message: 'Upload queued!' });

    (async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            // Construct Message
            let contentText = `**${title}**`;
            if (mention === 'everyone') contentText = `@everyone\n${contentText}`;
            else if (mention === 'here') contentText = `@here\n${contentText}`;
            
            if (description) contentText += `\n${description}`;

            const attachments = files.map(f => ({ attachment: f.path, name: f.originalname }));

            const message = await channel.send({
                content: contentText,
                files: attachments
            });

            // Auto-Reactions (Engagement)
            try {
                await message.react('🔥');
                await message.react('👍');
            } catch (err) {
                console.log("Could not react (permission issue?)");
            }

            console.log(`Posted to ${channel.name}`);
        } catch (error) {
            console.error('Upload Error:', error);
        } finally {
            cleanup(files);
        }
    })();
});

// 3. UNDO BUTTON (Safety Feature)
app.post('/api/delete-last', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const { channelId } = req.body;

    try {
        const channel = await client.channels.fetch(channelId);
        // Fetch last 20 messages to find the bot's last one
        const messages = await channel.messages.fetch({ limit: 20 });
        const lastBotMessage = messages.find(m => m.author.id === client.user.id);

        if (lastBotMessage) {
            await lastBotMessage.delete();
            console.log(`Deleted message in ${channel.name}`);
            return res.json({ success: true, message: 'Last post deleted.' });
        } else {
            return res.status(404).json({ error: 'No recent bot message found.' });
        }
    } catch (error) {
        console.error("Delete Error:", error);
        return res.status(500).json({ error: 'Failed to delete' });
    }
});

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.login(DISCORD_TOKEN);

const server = app.listen(PORT, () => console.log(`Online on ${PORT}`));
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
