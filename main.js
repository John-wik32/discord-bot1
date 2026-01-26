require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get Channels
app.get('/api/channels', async (req, res) => {
    if (req.headers.authorization !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Wrong Password' });

    try {
        const channels = [];
        // Ensure we have the latest data
        const guilds = await client.guilds.fetch();
        
        for (const [guildId, partialGuild] of guilds) {
            const guild = await partialGuild.fetch();
            const guildChannels = await guild.channels.fetch();
            
            guildChannels.forEach(channel => {
                if (channel.type === ChannelType.GuildText) {
                    // Check if bot can actually send messages here
                    const permissions = channel.permissionsFor(client.user);
                    if (permissions && permissions.has(PermissionsBitField.Flags.SendMessages)) {
                        channels.push({
                            id: channel.id,
                            name: `${guild.name} — #${channel.name}`
                        });
                    }
                }
            });
        }

        if (channels.length === 0) {
            return res.status(404).json({ error: 'No text channels found. Is the bot in a server with permissions?' });
        }

        res.json(channels);
    } catch (error) {
        console.error("Channel Fetch Error:", error);
        res.status(500).json({ error: 'Failed to fetch channels from Discord.' });
    }
});

// API: Send Video
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

client.on('ready', () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    console.log(`📊 Connected to ${client.guilds.cache.size} servers.`);
});

client.login(DISCORD_TOKEN).catch(err => console.error("Login failed:", err));
app.listen(PORT, () => console.log(`🚀 Dashboard on port ${PORT}`));
