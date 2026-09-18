require("dotenv").config();

const express = require("express");
const { REST } = require("@discordjs/rest");
const {
    WebSocketManager,
    WebSocketShardEvents
} = require("@discordjs/ws");

console.log("========================================");
console.log("COZY MUSICAPP - @DISCORDJS/WS TEST");
console.log("========================================");

console.log("Node.js:", process.version);

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("Token will NOT be printed.");


// ========================================
// EXPRESS SERVER
// ========================================

const app = express();

app.get("/", (req, res) => {
    res.send("Cozy MusicAPP is running.");
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        gatewayTest: "running"
    });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
});


// ========================================
// DISCORD REST MANAGER
// ========================================

console.log("");
console.log("========================================");
console.log("CREATING DISCORD REST MANAGER");
console.log("========================================");

const rest = new REST({
    version: "10"
});

rest.setToken(process.env.DISCORD_TOKEN);

console.log("REST manager created.");


// ========================================
// DISCORD WEBSOCKET MANAGER
// ========================================

console.log("");
console.log("========================================");
console.log("CREATING @DISCORDJS/WS MANAGER");
console.log("========================================");

let manager;

try {
    manager = new WebSocketManager({
        token: process.env.DISCORD_TOKEN,

        intents:
            (1 << 0) |   // Guilds
            (1 << 9) |   // Guild Messages
            (1 << 12),   // Message Content

        version: 10,

        totalShards: 1,

        rest,

        buildIdentifyPayload: (shardId) => {
            console.log("");
            console.log("========================================");
            console.log("BUILDING IDENTIFY PAYLOAD");
            console.log("========================================");

            console.log("Shard:", shardId);

            const intents =
                (1 << 0) |
                (1 << 9) |
                (1 << 12);

            console.log("Intents:", intents);

            return {
                token: process.env.DISCORD_TOKEN,

                intents,

                properties: {
                    os: "linux",
                    browser: "discord.js",
                    device: "discord.js"
                }
            };
        }
    });

    console.log("WebSocketManager created.");
} catch (error) {
    console.error("");
    console.error("========================================");
    console.error("❌ FAILED TO CREATE WEBSOCKET MANAGER");
    console.error("========================================");
    console.error(error);
    process.exit(1);
}


// ========================================
// DEBUG EVENTS
// ========================================

manager.on(WebSocketShardEvents.Debug, (message) => {
    console.log("WS DEBUG:", message);
});


// ========================================
// HELLO
// ========================================

manager.on(WebSocketShardEvents.Hello, (shardId, data) => {
    console.log("");
    console.log("========================================");
    console.log("📡 DISCORD HELLO RECEIVED");
    console.log("========================================");

    console.log("Shard:", shardId);
    console.log("Heartbeat interval:", data.heartbeat_interval);

    console.log("Discord Gateway WebSocket is working.");
});


// ========================================
// READY
// ========================================

manager.on(WebSocketShardEvents.Ready, (shardId, data) => {
    console.log("");
    console.log("========================================");
    console.log("🎉 DISCORD READY RECEIVED");
    console.log("========================================");

    console.log("Shard:", shardId);

    if (data) {
        console.log("Session ID received:", !!data.session_id);

        if (data.guilds) {
            console.log("Guild count:", data.guilds.length);
        }

        if (data.user) {
            console.log("Bot username:", data.user.username);
            console.log("Bot ID:", data.user.id);
        }
    }

    console.log("");
    console.log("========================================");
    console.log("✅ @DISCORDJS/WS TEST PASSED");
    console.log("========================================");
});


// ========================================
// RESUMED
// ========================================

manager.on(WebSocketShardEvents.Resumed, (shardId) => {
    console.log("");
    console.log("Discord session resumed.");
    console.log("Shard:", shardId);
});


// ========================================
// CLOSED
// ========================================

manager.on(WebSocketShardEvents.Closed, (shardId, code) => {
    console.log("");
    console.log("========================================");
    console.log("DISCORD WS CLOSED");
    console.log("========================================");

    console.log("Shard:", shardId);
    console.log("Close code:", code);
});


// ========================================
// START CONNECTION
// ========================================

console.log("");
console.log("========================================");
console.log("STARTING WEBSOCKET MANAGER");
console.log("========================================");

manager.connect()
    .then(() => {
        console.log("");
        console.log("manager.connect() completed.");
    })
    .catch((error) => {
        console.error("");
        console.error("========================================");
        console.error("❌ WEBSOCKET MANAGER FAILED");
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

    console.log("If READY appeared above:");
    console.log("✅ @discordjs/ws works.");

    console.log("");
    console.log("If this is still stuck before HELLO:");
    console.log("❌ @discordjs/ws is also having a Gateway problem.");

    console.log("========================================");
}, 60000);