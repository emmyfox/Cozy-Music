require("dotenv").config();

const express = require("express");
const {
    Client,
    GatewayIntentBits
} = require("discord.js");

console.log("========================================");
console.log("COZY MUSICAPP - DISCORD.JS TEST");
console.log("========================================");

console.log("Node.js:", process.version);

try {
    console.log("discord.js:", require("discord.js").version);
} catch {
    console.log("discord.js version: unknown");
}

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("Token will NOT be printed.");

console.log("========================================");
console.log("CREATING DISCORD CLIENT");
console.log("========================================");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ],

    ws: {
        handshakeTimeout: 30000,
        helloTimeout: 30000,
        readyTimeout: 60000
    }
});

console.log("Discord client created.");


// ========================================
// EXPRESS WEB SERVER
// ========================================

const app = express();

app.get("/", (req, res) => {
    res.send("Cozy MusicAPP is running.");
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        discordReady: client.isReady(),
        bot: client.user
            ? {
                id: client.user.id,
                username: client.user.username
            }
            : null,
        guilds: client.guilds.cache.size
    });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
});


// ========================================
// DISCORD DEBUG EVENTS
// ========================================

client.on("debug", (message) => {
    console.log("DISCORD DEBUG:", message);
});

client.on("warn", (message) => {
    console.warn("DISCORD WARNING:", message);
});

client.on("error", (error) => {
    console.error("DISCORD CLIENT ERROR:");
    console.error(error);
});

client.on("shardConnecting", (id) => {
    console.log("========================================");
    console.log("DISCORD SHARD CONNECTING");
    console.log("Shard:", id);
    console.log("========================================");
});

client.on("shardReady", (id) => {
    console.log("========================================");
    console.log("DISCORD SHARD READY");
    console.log("Shard:", id);
    console.log("========================================");
});

client.on("shardDisconnect", (event, id) => {
    console.log("========================================");
    console.log("DISCORD SHARD DISCONNECTED");
    console.log("Shard:", id);
    console.log("Event:", event);
    console.log("========================================");
});

client.on("shardReconnecting", (id) => {
    console.log("========================================");
    console.log("DISCORD SHARD RECONNECTING");
    console.log("Shard:", id);
    console.log("========================================");
});


// ========================================
// READY
// ========================================

client.once("ready", () => {
    console.log("");
    console.log("========================================");
    console.log("🎉 DISCORD.JS IS READY!");
    console.log("========================================");

    console.log("Bot username:", client.user.username);
    console.log("Bot ID:", client.user.id);
    console.log("Guild count:", client.guilds.cache.size);

    client.guilds.cache.forEach((guild) => {
        console.log("Guild:", guild.name);
        console.log("Guild ID:", guild.id);
    });

    console.log("========================================");
    console.log("GATEWAY TEST PASSED");
    console.log("========================================");
});


// ========================================
// LOGIN
// ========================================

console.log("");
console.log("========================================");
console.log("ATTEMPTING DISCORD LOGIN");
console.log("========================================");

console.log("Calling client.login()...");
console.log("Token will NOT be printed.");

client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log("client.login() promise resolved.");
    })
    .catch((error) => {
        console.error("========================================");
        console.error("❌ DISCORD LOGIN FAILED");
        console.error("========================================");
        console.error(error);
    });


// ========================================
// 60 SECOND DIAGNOSTIC
// ========================================

setTimeout(() => {
    console.log("");
    console.log("========================================");
    console.log("60 SECOND DIAGNOSTIC");
    console.log("========================================");

    console.log("Client ready:", client.isReady());

    if (client.user) {
        console.log("Bot username:", client.user.username);
        console.log("Bot ID:", client.user.id);
    } else {
        console.log("Bot user: none");
    }

    console.log("Guild cache:", client.guilds.cache.size);

    if (client.isReady()) {
        console.log("");
        console.log("✅ DISCORD.JS SUCCESSFULLY CONNECTED.");
    } else {
        console.log("");
        console.log("❌ DISCORD.JS IS STILL NOT READY.");
        console.log("");
        console.log("Raw WebSocket IDENTIFY previously worked.");
        console.log("This means the remaining problem is inside");
        console.log("the discord.js Gateway connection layer.");
    }

    console.log("========================================");
}, 60000);