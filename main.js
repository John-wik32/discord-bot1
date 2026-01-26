require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 8000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const app = express();
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ROOT PAGE: This MUST load for Koyeb to see the bot as "Healthy"
app.get('/', (req, res) => {
    const status = client.isReady() ? "ONLINE ✅" : "CONNECTING/OFFLINE ❌";
    res.send(`<h1>Bot Status: ${status}</h1><p>Check Koyeb logs if offline.</p>`);
});

// API ROUTE: Prevents 503 by always responding
app.get('/api/channels', (req, res) => {
    if (!client.isReady()) {
        return res.status(200).json([{ id: '0', name: 'Waiting for bot to connect...' }]);
    }
    // ... rest of your channel logic
    res.json([]); 
});

// STARTUP
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server active on port ${PORT}`);
    
    if (!DISCORD_TOKEN) {
        console.error("FATAL: DISCORD_TOKEN is missing in Koyeb Env Vars!");
    } else {
        client.login(DISCORD_TOKEN).catch(err => {
            console.error("DISCORD LOGIN ERROR:", err.message);
        });
    }
});
