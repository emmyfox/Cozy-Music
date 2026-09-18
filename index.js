require("dotenv").config();

const express = require("express");
const { REST } = require("@discordjs/rest");
const {
    WebSocketManager,
    WebSocketShardEvents
} = require("@discordjs/ws");
const { Routes } = require("discord-api-types/v10");

console.log("========================================");
console.log("COZY MUSIC - @DISCORDJS/WS TEST");
console.log("========================================");

console.log("Node.js:", process.version);

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error("❌ DISCORD_TOKEN is missing!");
    process.exit(1);
}

console.log("✅ DISCORD_TOKEN found.");
console.log("Token will NOT be printed.");
console.log("----------------------------------------");

const app = express();

app.get("/", (req, res) => {
    res.send("Cozy Music @discordjs/ws diagnostic is running!");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
});

async function runGatewayTest() {
    try {
        console.log("");
        console.log("========================================");
        console.log("STEP 1 - CREATING REST MANAGER");
        console.log("========================================");

        const rest = new REST({
            version: "10"
        }).setToken(token);

        console.log("✅ REST manager created.");

        console.log("");
        console.log("========================================");
        console.log("STEP 2 - FETCHING /gateway/bot");
        console.log("========================================");

        console.log("Requesting Discord Gateway information...");

        const gatewayInfo = await rest.get(Routes.gatewayBot());

        console.log("✅ /gateway/bot RESPONSE RECEIVED");

        console.log("----------------------------------------");
        console.log("Gateway URL:", gatewayInfo.url);
        console.log("Recommended shards:", gatewayInfo.shards);
        console.log("Session start limit:");
        console.log("  Total:", gatewayInfo.session_start_limit?.total);
        console.log("  Remaining:", gatewayInfo.session_start_limit?.remaining);
        console.log("  Reset after:", gatewayInfo.session_start_limit?.reset_after);
        console.log("----------------------------------------");

        console.log("");
        console.log("========================================");
        console.log("STEP 3 - CREATING WEBSOCKET MANAGER");
        console.log("========================================");

        const manager = new WebSocketManager({
            token: token,
            intents: 0,

            handshakeTimeout: 30000,
            helloTimeout: 30000,
            readyTimeout: 60000,

            version: "10",
            encoding: "json",
            compression: null
        });

        console.log("✅ WebSocketManager created.");

        manager.on(WebSocketShardEvents.Debug, (message) => {
            console.log("WS DEBUG:", message);
        });

        manager.on(WebSocketShardEvents.Hello, (data) => {
            console.log("");
            console.log("========================================");
            console.log("🎉 DISCORD HELLO RECEIVED");
            console.log("========================================");
            console.log("HELLO DATA RECEIVED.");
            console.log("Heartbeat interval:", data.heartbeat_interval);
        });

        manager.on(WebSocketShardEvents.Ready, (data) => {
            console.log("");
            console.log("========================================");
            console.log("🎉 DISCORD READY RECEIVED");
            console.log("========================================");
            console.log("Session ID received:", !!data.session_id);
            console.log("Guild count:", data.guilds?.length);
            console.log("Bot user ID:", data.user?.id);
            console.log("Bot username:", data.user?.username);

            console.log("");
            console.log("========================================");
            console.log("✅ @DISCORDJS/WS TEST PASSED");
            console.log("========================================");
        });

        manager.on(WebSocketShardEvents.Dispatch, (data) => {
            console.log("");
            console.log("WS DISPATCH EVENT:", data.data?.t || "UNKNOWN");

            if (data.data?.t === "READY") {
                console.log("✅ READY DISPATCH CONFIRMED.");
            }

            if (data.data?.t === "GUILD_CREATE") {
                console.log("✅ GUILD_CREATE RECEIVED.");
            }
        });

        manager.on(WebSocketShardEvents.Closed, (data) => {
            console.log("");
            console.log("⚠️ WEBSOCKET CLOSED");
            console.log("Close data:", data);
        });

        console.log("");
        console.log("========================================");
        console.log("STEP 4 - CONNECTING WEBSOCKET MANAGER");
        console.log("========================================");

        console.log("Calling manager.connect()...");

        await manager.connect({
            gatewayInformation: gatewayInfo
        });

        console.log("");
        console.log("========================================");
        console.log("manager.connect() COMPLETED");
        console.log("========================================");

    } catch (error) {
        console.error("");
        console.error("========================================");
        console.error("❌ @DISCORDJS/WS TEST FAILED");
        console.error("========================================");

        console.error("Error name:", error?.name);
        console.error("Error message:", error?.message);
        console.error("Error code:", error?.code);

        console.error("Full error:");
        console.error(error);

        console.error("========================================");
    }
}

runGatewayTest();