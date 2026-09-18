require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

console.log("========================================");
console.log("COZY MUSIC - DISCORD GATEWAY TEST");
console.log("========================================");

console.log("Node.js:", process.version);

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing!");
    process.exit(1);
}

console.log("✅ DISCORD_TOKEN found.");
console.log("Token will NOT be printed.");
console.log("----------------------------------------");

console.log("Creating Discord client...");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

console.log("✅ Discord client created.");

client.on("debug", (message) => {
    console.log("DISCORD DEBUG:", message);
});

client.on("error", (error) => {
    console.error("❌ DISCORD CLIENT ERROR:");
    console.error(error);
});

client.on("warn", (message) => {
    console.warn("⚠️ DISCORD WARNING:", message);
});

client.on("ready", () => {
    console.log("");
    console.log("========================================");
    console.log("🎉🎉🎉 DISCORD READY! 🎉🎉🎉");
    console.log("========================================");
    console.log("Bot username:", client.user.tag);
    console.log("Bot ID:", client.user.id);
    console.log("Guild count:", client.guilds.cache.size);
    console.log("========================================");
    console.log("✅ DISCORD.JS GATEWAY TEST PASSED!");
    console.log("========================================");
});

client.on("shardReady", (id) => {
    console.log("✅ Shard ready:", id);
});

console.log("Starting client.login()...");
console.log("----------------------------------------");

client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log("client.login() completed.");
    })
    .catch((error) => {
        console.error("");
        console.error("❌ LOGIN FAILED");
        console.error(error);
    });

const app = express();

app.get("/", (req, res) => {
    res.send("Cozy Music Gateway Test is running!");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
    console.log("Waiting for Discord Gateway...");
});