require("dotenv").config();

const express = require("express");

console.log("========================================");
console.log("COZY MUSICAPP - PACKAGE DIAGNOSTIC");
console.log("========================================");

console.log("Node.js:", process.version);

function getVersion(packageName) {
    try {
        const packageJson = require(`${packageName}/package.json`);
        return packageJson.version;
    } catch (error) {
        return "Unable to read version";
    }
}

console.log("");
console.log("PACKAGE VERSIONS");
console.log("----------------------------------------");

console.log("discord.js:", getVersion("discord.js"));
console.log("@discordjs/ws:", getVersion("@discordjs/ws"));
console.log("@discordjs/rest:", getVersion("@discordjs/rest"));
console.log("@discordjs/voice:", getVersion("@discordjs/voice"));
console.log("ws:", getVersion("ws"));
console.log("prism-media:", getVersion("prism-media"));
console.log("opusscript:", getVersion("opusscript"));

console.log("");
console.log("========================================");
console.log("DEPENDENCY TEST");
console.log("========================================");

try {
    const Discord = require("discord.js");

    console.log("✅ discord.js loaded successfully.");

    if (Discord.Client) {
        console.log("✅ discord.js Client available.");
    }

    if (Discord.GatewayIntentBits) {
        console.log("✅ GatewayIntentBits available.");
    }
} catch (error) {
    console.error("❌ discord.js failed to load.");
    console.error(error);
}

try {
    const WS = require("@discordjs/ws");

    console.log("✅ @discordjs/ws loaded successfully.");

    if (WS.WebSocketManager) {
        console.log("✅ WebSocketManager available.");
    }
} catch (error) {
    console.error("❌ @discordjs/ws failed to load.");
    console.error(error);
}

try {
    const REST = require("@discordjs/rest");

    console.log("✅ @discordjs/rest loaded successfully.");
} catch (error) {
    console.error("❌ @discordjs/rest failed to load.");
    console.error(error);
}


// ========================================
// EXPRESS
// ========================================

const app = express();

app.get("/", (req, res) => {
    res.send("Cozy MusicAPP package diagnostic is running.");
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        diagnostic: "packages"
    });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
    console.log("");
    console.log("PACKAGE DIAGNOSTIC COMPLETE");
    console.log("========================================");
});