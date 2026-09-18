```js
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

// ==========================================
// CHECK DISCORD TOKEN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing!');
    console.error('Add DISCORD_TOKEN to your Render Environment Variables.');
    process.exit(1);
}

// ==========================================
// EXPRESS WEB SERVER
// ==========================================

const app = express();

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('🎶 Cozy Music Bot is alive!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ==========================================
// DISCORD CLIENT
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// BOT READY
// ==========================================

client.once('clientReady', async () => {

    console.log('🤖 COZY MUSIC BOT ONLINE');
    console.log(`👤 Logged in as ${client.user.tag}`);

    // ==========================================
    // REGISTER SLASH COMMANDS
    // ==========================================

    const commands = [
        {
            name: 'play',
            description: 'Join your voice channel and play cozy music.'
        }
    ];

    const rest = new REST({ version: '10' })
        .setToken(process.env.DISCORD_TOKEN);

    try {

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log('✅ Slash commands registered.');

    } catch (error) {

        console.error(
            '❌
```
