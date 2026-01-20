const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

// Initialize Schedule File if missing
if (!fs.existsSync(SCHEDULE_FILE)) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([]));
}

app.use(cors());
app.use(express.json());
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// --- SCHEDULER LOGIC ---
const checkAndSendSchedules = async () => {
    try {
        const data = fs.readFileSync(SCHEDULE_FILE);
        let tasks = JSON.parse(data);
        const now = new Date();
        const remainingTasks = [];

        for (const task of tasks) {
            const taskTime = new Date(task.time);
            if (taskTime <= now) {
                try {
                    const channel = await client.channels.fetch(task.channelId);
                    await channel.send({ content: task.content });
                    console.log(`⏰ Scheduled post sent to #${channel.name}`);
                } catch (err) {
                    console.error("Scheduled post failed:", err.message);
                }
            } else {
                remainingTasks.push(task);
            }
        }
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(remainingTasks));
    } catch (err) {
        console.error("Scheduler error:", err);
    }
};

// Check every minute
setInterval(checkAndSendSchedules, 60000);

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/health', (req, res) => res.status(200).send('OK'));

const checkAuth = (req, res, next) => {
    if (req.headers['authorization'] !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Wrong Password' });
    }
    next();
};

app.get('/api/channels', checkAuth, async (req, res) => {
    const channels = [];
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.filter(ch => ch.type === 0).forEach(ch => {
            channels.push({ id: ch.id, name: `${guild.name} - #${ch.name}` });
        });
    });
    res.json(channels);
});

app.post('/api/post', checkAuth, upload.single('mediaFile'), async (req, res) => {
    const { channelId, postTitle, scheduleTime } = req.body;

    if (scheduleTime) {
        const tasks = JSON.parse(fs.readFileSync(SCHEDULE_FILE));
        tasks.push({ channelId, content: postTitle, time: scheduleTime });
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks));
        return res.json({ success: true, scheduled: true });
    }

    try {
        const channel = await client.channels.fetch(channelId);
        const options = { content: postTitle || "" };
        if (req.file) {
            options.files = [new AttachmentBuilder(req.file.buffer, { name: req.file.originalname })];
        }
        await channel.send(options);
        res.json({ success: true, scheduled: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- START ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.once('ready', () => console.log(`✅ Bot Online: ${client.user.tag}`));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 UI on port ${PORT}`));
client.login(DISCORD_TOKEN);
