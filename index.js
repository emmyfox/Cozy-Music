```js
require("dotenv").config();

const express = require("express");
const dns = require("dns");
const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus
} = require("@discordjs/voice");

// ============================================================
// PACKAGE / RUNTIME INFORMATION
// ============================================================

console.log("========================================");
console.log("📦 PACKAGE / RUNTIME INFORMATION");
console.log("========================================");

console.log("🟢 Node.js:", process.version);

try {
    console.log(
        "🟢 discord.js:",
        require("discord.js/package.json").version
    );
} catch (error) {
    console.log("⚠️ Could not read discord.js version.");
}

try {
    console.log(
        "🟢 @discordjs/voice:",
        require("@discordjs/voice/package.json").version
    );
} catch (error) {
    console.log("⚠️ Could not read @discordjs/voice version.");
}

try {
    console.log(
        "🟢 opusscript:",
        require("opusscript/package.json").version
    );
} catch (error) {
    console.log("⚠️ Could not read opusscript version.");
}

console.log("========================================");
console.log("");

// ============================================================
// ENVIRONMENT
// ============================================================

const PORT = process.env.PORT || 10000;

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

// ============================================================
// EXPRESS WEB SERVER
// ============================================================

const app = express();

app.get("/
```
