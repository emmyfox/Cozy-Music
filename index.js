require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Events
} = require("discord.js");

const http = require("http");

console.log("========================================");
console.log("COZY MUSIC - DISCORD.JS GATEWAY DIAGNOSTIC");
console.log("========================================");

console.log("Node.js:", process.version);
console.log("discord.js:", require("discord.js").version);

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("Token length:", process.env.DISCORD_TOKEN.length);
console.log("Token prefix:", process.env.DISCORD_TOKEN.substring(0, 5) + "...");

console.log("========================================");
console.log("CREATING DISCORD CLIENT");
console.log("========================================");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

console.log("Discord client created.");

//
// ---------------------------------------------------------
// DISCORD EVENTS
// ---------------------------------------------------------
//

client.on(Events.ClientReady, (readyClient) => {
    console.log("");
    console.log("========================================");
    console.log("🎉🎉🎉 DISCORD CLIENT READY 🎉🎉🎉");
    console.log("========================================");
    console.log("Logged in as:", readyClient.user.tag);
    console.log("User ID:", readyClient.user.id);
    console.log("Guild count:", readyClient.guilds.cache.size);
    console.log("========================================");
});

client.on(Events.Error, (error) => {
    console.error("");
    console.error("========================================");
    console.error("❌ DISCORD CLIENT ERROR");
    console.error("========================================");
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);
    console.error(error);
    console.error("========================================");
});

client.on(Events.Warn, (warning) => {
    console.warn("");
    console.warn("========================================");
    console.warn("⚠️ DISCORD WARNING");
    console.warn("========================================");
    console.warn(warning);
    console.warn("========================================");
});

client.on(Events.Debug, (message) => {
    console.log("DISCORD DEBUG:", message);
});

client.on(Events.ShardReady, (id, unavailableGuilds) => {
    console.log("");
    console.log("========================================");
    console.log("🟢 SHARD READY");
    console.log("========================================");
    console.log("Shard:", id);
    console.log("Unavailable guilds:", unavailableGuilds);
    console.log("========================================");
});

client.on(Events.ShardConnecting, (id) => {
    console.log("");
    console.log("========================================");
    console.log("🔵 SHARD CONNECTING");
    console.log("========================================");
    console.log("Shard:", id);
    console.log("========================================");
});

client.on(Events.ShardDisconnect, (event, id) => {
    console.log("");
    console.log("========================================");
    console.log("🔴 SHARD DISCONNECTED");
    console.log("========================================");
    console.log("Shard:", id);
    console.log("Code:", event?.code);
    console.log(
        "Reason:",
        event?.reason?.toString?.() || "No reason"
    );
    console.log("========================================");
});

client.on(Events.ShardReconnecting, (id) => {
    console.log("");
    console.log("========================================");
    console.log("🟡 SHARD RECONNECTING");
    console.log("========================================");
    console.log("Shard:", id);
    console.log("========================================");
});

//
// ---------------------------------------------------------
// DISCORD.JS LOGIN
// ---------------------------------------------------------
//

console.log("========================================");
console.log("STARTING DISCORD.JS LOGIN");
console.log("========================================");

console.log("Attempting client.login()...");
console.log("The token itself will NOT be printed.");

const loginStart = Date.now();

client.login(process.env.DISCORD_TOKEN)
    .then((result) => {
        console.log("");
        console.log("========================================");
        console.log("✅ client.login() RESOLVED");
        console.log("========================================");

        console.log(
            "Login result:",
            result ? "[TOKEN RETURNED]" : result
        );

        console.log(
            "Login took:",
            Date.now() - loginStart,
            "ms"
        );

        console.log("========================================");
    })
    .catch((error) => {
        console.error("");
        console.error("========================================");
        console.error("❌❌❌ client.login() FAILED ❌❌❌");
        console.error("========================================");

        console.error("Error name:", error?.name);
        console.error("Error message:", error?.message);
        console.error("Error code:", error?.code);

        console.error("Error stack:");
        console.error(error?.stack || error);

        console.error("========================================");

        process.exitCode = 1;
    });

//
// ---------------------------------------------------------
// 60 SECOND LOGIN CHECK
// ---------------------------------------------------------
//

setTimeout(() => {
    console.log("");
    console.log("========================================");
    console.log("⏰ 60 SECOND LOGIN DIAGNOSTIC");
    console.log("========================================");

    if (client.isReady()) {
        console.log("✅ Client is already READY.");
        console.log("Logged in as:", client.user?.tag);
        console.log("Guild count:", client.guilds.cache.size);
    } else {
        console.log("❌ Client is NOT READY after 60 seconds.");
        console.log("");
        console.log(
            "discord.js is still stuck during the Gateway connection."
        );
        console.log("");
        console.log("Client status:");
        console.log("isReady:", client.isReady());
        console.log(
            "user:",
            client.user?.tag || "none"
        );
        console.log(
            "guild cache:",
            client.guilds.cache.size
        );
    }

    console.log("========================================");
}, 60000);

//
// ---------------------------------------------------------
// RENDER WEB SERVER
// ---------------------------------------------------------
//

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end(
        "Cozy Music Discord diagnostic is running.\n"
    );
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
    console.log("========================================");
});