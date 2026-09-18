require("dotenv").config();

const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const WebSocket = require("ws");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    NoSubscriberBehavior,
    entersState
} = require("@discordjs/voice");

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

const API_VERSION = "10";
const GATEWAY_URL =
    `wss://gateway.discord.gg/?v=${API_VERSION}&encoding=json`;

const APPLICATION_ID =
    process.env.APPLICATION_ID || "1550323613708714024";

const GUILD_ID =
    process.env.GUILD_ID || "1316737145901285386";

const VOICE_CHANNEL_ID =
    process.env.VOICE_CHANNEL_ID || "1549830484618383424";

const MUSIC_FOLDER = path.join(__dirname, "music");

const INTENTS =
    1 +       // GUILDS
    128;      // GUILD_VOICE_STATES

let gateway = null;
let heartbeatTimer = null;
let heartbeatInterval = null;
let reconnectTimer = null;

let botUser = null;
let sequence = null;
let identified = false;

const voiceAdapters = new Map();
const voiceConnections = new Map();
const players = new Map();

const queues = new Map();

console.log("========================================");
console.log("🎵 COZY MUSIC");
console.log("========================================");
console.log("Node.js:", process.version);
console.log("Application ID:", APPLICATION_ID);
console.log("Guild ID:", GUILD_ID);
console.log("Voice Channel ID:", VOICE_CHANNEL_ID);
console.log("Music folder:", MUSIC_FOLDER);
console.log("----------------------------------------");
console.log("Token found:", !!TOKEN);
console.log("Token will NOT be printed.");
console.log("========================================");


/* =========================================================
   WEB SERVER
   ========================================================= */

const app = express();

app.get("/", (req, res) => {
    res.send("🎵 Cozy Music is running!");
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        gatewayConnected:
            gateway &&
            gateway.readyState === WebSocket.OPEN,
        identified,
        bot: botUser
            ? {
                id: botUser.id,
                username: botUser.username
            }
            : null
    });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("");
    console.log("🌐 Web server listening on port", PORT);
});


/* =========================================================
   DISCORD REST
   ========================================================= */

function discordRequest(method, requestPath, body = null) {
    return new Promise((resolve, reject) => {
        const data = body === null
            ? null
            : Buffer.from(JSON.stringify(body));

        const request = https.request(
            {
                hostname: "discord.com",
                port: 443,
                path: `/api/v${API_VERSION}${requestPath}`,
                method,
                timeout: 30000,
                headers: {
                    "Authorization": `Bot ${TOKEN}`,
                    "User-Agent": "CozyMusic/1.0",
                    "Accept": "application/json",
                    ...(data
                        ? {
                            "Content-Type": "application/json",
                            "Content-Length": data.length
                        }
                        : {})
                }
            },
            (response) => {
                let responseBody = "";

                response.setEncoding("utf8");

                response.on("data", (chunk) => {
                    responseBody += chunk;
                });

                response.on("end", () => {
                    let parsed = null;

                    if (responseBody.length > 0) {
                        try {
                            parsed = JSON.parse(responseBody);
                        } catch {
                            parsed = responseBody;
                        }
                    }

                    if (
                        response.statusCode >= 200 &&
                        response.statusCode < 300
                    ) {
                        resolve(parsed);
                        return;
                    }

                    reject(
                        new Error(
                            `Discord API ${response.statusCode}: ` +
                            `${typeof parsed === "string"
                                ? parsed
                                : JSON.stringify(parsed)}`
                        )
                    );
                });
            }
        );

        request.on("timeout", () => {
            request.destroy(
                new Error("Discord REST request timed out.")
            );
        });

        request.on("error", reject);

        if (data) {
            request.write(data);
        }

        request.end();
    });
}


/* =========================================================
   REGISTER SLASH COMMANDS
   ========================================================= */

const COMMANDS = [
    {
        name: "play",
        description: "Play a song from the Cozy Music library.",
        options: [
            {
                name: "song",
                description: "The music file to play.",
                type: 3,
                required: true
            }
        ]
    },
    {
        name: "stop",
        description: "Stop the music and leave voice."
    },
    {
        name: "pause",
        description: "Pause the current song."
    },
    {
        name: "resume",
        description: "Resume the current song."
    },
    {
        name: "skip",
        description: "Skip the current song."
    },
    {
        name: "queue",
        description: "Show the current music queue."
    }
];

async function registerCommands() {
    console.log("");
    console.log("========================================");
    console.log("REGISTERING SLASH COMMANDS");
    console.log("========================================");

    try {
        await discordRequest(
            "PUT",
            `/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
            COMMANDS
        );

        console.log("✅ Slash commands registered.");
        console.log("Commands:");
        console.log("  /play");
        console.log("  /stop");
        console.log("  /pause");
        console.log("  /resume");
        console.log("  /skip");
        console.log("  /queue");
    } catch (error) {
        console.error("❌ Failed to register commands.");
        console.error(error.message);
    }
}


/* =========================================================
   MUSIC FILES
   ========================================================= */

function getMusicFiles() {
    if (!fs.existsSync(MUSIC_FOLDER)) {
        return [];
    }

    return fs
        .readdirSync(MUSIC_FOLDER)
        .filter((file) => {
            const lower = file.toLowerCase();

            return (
                lower.endsWith(".mp3") ||
                lower.endsWith(".wav") ||
                lower.endsWith(".ogg") ||
                lower.endsWith(".webm")
            );
        });
}

function findMusicFile(searchName) {
    const files = getMusicFiles();

    const cleanSearch = searchName
        .trim()
        .toLowerCase();

    let exact = files.find(
        (file) => file.toLowerCase() === cleanSearch
    );

    if (exact) {
        return exact;
    }

    if (!cleanSearch.endsWith(".mp3")) {
        exact = files.find(
            (file) =>
                file.toLowerCase() ===
                `${cleanSearch}.mp3`.toLowerCase()
        );

        if (exact) {
            return exact;
        }
    }

    return files.find(
        (file) =>
            file
                .toLowerCase()
                .includes(cleanSearch)
    ) || null;
}


/* =========================================================
   VOICE ADAPTER
   ========================================================= */

function createRawVoiceAdapterCreator(guildId) {
    return (methods) => {
        const adapter = {
            destroyed: false,

            sendPayload(payload) {
                if (this.destroyed) {
                    return false;
                }

                if (
                    !gateway ||
                    gateway.readyState !== WebSocket.OPEN
                ) {
                    console.error(
                        "❌ Cannot send voice state: Gateway is not connected."
                    );

                    return false;
                }

                try {
                    gateway.send(
                        JSON.stringify(payload)
                    );

                    return true;
                } catch (error) {
                    console.error(
                        "❌ Failed to send voice payload:",
                        error
                    );

                    return false;
                }
            },

            destroy() {
                if (this.destroyed) {
                    return;
                }

                this.destroyed = true;

                voiceAdapters.delete(guildId);

                try {
                    methods.destroy();
                } catch {}
            },

            onVoiceStateUpdate(data) {
                if (this.destroyed) {
                    return;
                }

                methods.onVoiceStateUpdate(data);
            },

            onVoiceServerUpdate(data) {
                if (this.destroyed) {
                    return;
                }

                methods.onVoiceServerUpdate(data);
            }
        };

        voiceAdapters.set(guildId, adapter);

        return adapter;
    };
}


/* =========================================================
   VOICE EVENTS
   ========================================================= */

function handleVoiceStateUpdate(data) {
    if (!botUser) {
        return;
    }

    if (data.user_id !== botUser.id) {
        return;
    }

    const guildId = data.guild_id;

    if (!guildId) {
        return;
    }

    const adapter = voiceAdapters.get(guildId);

    if (!adapter) {
        return;
    }

    console.log(
        "🔊 VOICE_STATE_UPDATE received."
    );

    console.log(
        "Channel:",
        data.channel_id
    );

    adapter.onVoiceStateUpdate(data);

    if (!data.channel_id) {
        console.log(
            "🔊 Bot was disconnected from voice."
        );
    }
}

function handleVoiceServerUpdate(data) {
    const guildId = data.guild_id;

    if (!guildId) {
        return;
    }

    const adapter = voiceAdapters.get(guildId);

    if (!adapter) {
        return;
    }

    console.log(
        "🌐 VOICE_SERVER_UPDATE received."
    );

    console.log(
        "Guild:",
        guildId
    );

    console.log(
        "Endpoint:",
        data.endpoint
    );

    adapter.onVoiceServerUpdate(data);
}


/* =========================================================
   GET / CREATE AUDIO PLAYER
   ========================================================= */

function getPlayer(guildId) {
    if (players.has(guildId)) {
        return players.get(guildId);
    }

    const player = createAudioPlayer({
        behaviors: {
            noSubscriber:
                NoSubscriberBehavior.Pause
        }
    });

    player.on(
        "error",
        (error) => {
            console.error(
                "❌ Audio player error:",
                error
            );

            playNext(guildId);
        }
    );

    player.on(
        AudioPlayerStatus.Idle,
        () => {
            console.log(
                "🎵 Audio player became idle."
            );

            playNext(guildId);
        }
    );

    player.on(
        AudioPlayerStatus.Playing,
        () => {
            console.log(
                "▶️ Audio player is playing."
            );
        }
    );

    player.on(
        AudioPlayerStatus.Paused,
        () => {
            console.log(
                "⏸️ Audio player is paused."
            );
        }
    );

    players.set(guildId, player);

    return player;
}


/* =========================================================
   PLAY FILE
   ========================================================= */

async function playFile(guildId, fileName) {
    const filePath = path.join(
        MUSIC_FOLDER,
        fileName
    );

    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Music file does not exist: ${fileName}`
        );
    }

    const connection =
        voiceConnections.get(guildId);

    if (!connection) {
        throw new Error(
            "The bot is not connected to voice."
        );
    }

    const player = getPlayer(guildId);

    const resource =
        createAudioResource(
            filePath,
            {
                inputType: StreamType.Arbitrary
            }
        );

    connection.subscribe(player);

    player.play(resource);

    console.log("");
    console.log("========================================");
    console.log("🎵 NOW PLAYING");
    console.log("========================================");
    console.log(fileName);
    console.log("========================================");
}


/* =========================================================
   PLAY NEXT
   ========================================================= */

async function playNext(guildId) {
    const queue = queues.get(guildId);

    if (!queue || queue.length === 0) {
        console.log(
            "🎵 Queue is empty."
        );

        return;
    }

    const nextSong = queue.shift();

    try {
        await playFile(
            guildId,
            nextSong
        );
    } catch (error) {
        console.error(
            "❌ Could not play next song:",
            error.message
        );

        await playNext(guildId);
    }
}


/* =========================================================
   JOIN VOICE
   ========================================================= */

async function connectToVoice(guildId) {
    if (voiceConnections.has(guildId)) {
        const existing =
            voiceConnections.get(guildId);

        if (
            existing.state.status !==
            VoiceConnectionStatus.Destroyed
        ) {
            return existing;
        }
    }

    console.log("");
    console.log("========================================");
    console.log("🔊 JOINING VOICE");
    console.log("========================================");
    console.log("Guild:", guildId);
    console.log("Channel:", VOICE_CHANNEL_ID);

    const connection = joinVoiceChannel({
        guildId,
        channelId: VOICE_CHANNEL_ID,

        adapterCreator:
            createRawVoiceAdapterCreator(guildId),

        selfDeaf: false,
        selfMute: false,

        // Current Discord voice requires DAVE.
        daveEncryption: true,

        debug: true
    });

    connection.on(
        "debug",
        (message) => {
            console.log(
                "VOICE DEBUG:",
                message
            );
        }
    );

    connection.on(
        "error",
        (error) => {
            console.error(
                "❌ VOICE CONNECTION ERROR:"
            );

            console.error(error);
        }
    );

    connection.on(
        "stateChange",
        (oldState, newState) => {
            console.log(
                `🔊 Voice state: ${oldState.status} -> ${newState.status}`
            );
        }
    );

    voiceConnections.set(
        guildId,
        connection
    );

    try {
        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            30000
        );

        console.log("");
        console.log("========================================");
        console.log("🎉 VOICE CONNECTION READY");
        console.log("========================================");

        return connection;

    } catch (error) {
        console.error("");
        console.error(
            "❌ Voice connection did not become ready."
        );

        console.error(error);

        try {
            connection.destroy();
        } catch {}

        voiceConnections.delete(
            guildId
        );

        throw error;
    }
}


/* =========================================================
   STOP MUSIC
   ========================================================= */

function stopMusic(guildId) {
    const player = players.get(guildId);

    if (player) {
        player.stop(true);
    }

    queues.set(
        guildId,
        []
    );

    const connection =
        voiceConnections.get(guildId);

    if (connection) {
        try {
            connection.destroy();
        } catch {}

        voiceConnections.delete(
            guildId
        );
    }
}


/* =========================================================
   INTERACTION RESPONSES
   ========================================================= */

async function interactionResponse(
    interaction,
    content,
    ephemeral = false
) {
    const flags = ephemeral ? 64 : 0;

    return discordRequest(
        "POST",
        `/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            type: 4,
            data: {
                content,
                flags
            }
        }
    );
}


/* =========================================================
   INTERACTION HANDLER
   ========================================================= */

async function handleInteraction(interaction) {
    if (interaction.type !== 2) {
        return;
    }

    const commandName =
        interaction.data?.name;

    if (!commandName) {
        return;
    }

    console.log("");
    console.log(
        `🎵 /${commandName} used`
    );

    try {
        if (commandName === "play") {
            const option =
                interaction.data.options?.find(
                    (item) =>
                        item.name === "song"
                );

            const requestedSong =
                option?.value;

            if (!requestedSong) {
                await interactionResponse(
                    interaction,
                    "❌ You need to tell me which song to play.",
                    true
                );

                return;
            }

            const fileName =
                findMusicFile(
                    requestedSong
                );

            if (!fileName) {
                const files =
                    getMusicFiles();

                let message =
                    `❌ I couldn't find **${requestedSong}**.`;

                if (files.length > 0) {
                    message +=
                        `\n\nAvailable songs:\n${files
                            .slice(0, 20)
                            .map(
                                (file) =>
                                    `• ${file}`
                            )
                            .join("\n")}`;

                    if (files.length > 20) {
                        message +=
                            `\n…and ${files.length - 20} more.`;
                    }
                }

                await interactionResponse(
                    interaction,
                    message,
                    true
                );

                return;
            }

            const guildId =
                interaction.guild_id;

            if (!guildId) {
                await interactionResponse(
                    interaction,
                    "❌ This command must be used inside the server.",
                    true
                );

                return;
            }

            if (!queues.has(guildId)) {
                queues.set(
                    guildId,
                    []
                );
            }

            const player =
                players.get(guildId);

            const connection =
                voiceConnections.get(guildId);

            const isPlaying =
                player &&
                player.state.status ===
                AudioPlayerStatus.Playing;

            if (
                connection &&
                isPlaying
            ) {
                queues
                    .get(guildId)
                    .push(fileName);

                await interactionResponse(
                    interaction,
                    `🎵 Added **${fileName}** to the queue.`
                );

                return;
            }

            await interactionResponse(
                interaction,
                `🎵 Loading **${fileName}**...`
            );

            await connectToVoice(
                guildId
            );

            await playFile(
                guildId,
                fileName
            );

            return;
        }


        if (commandName === "stop") {
            stopMusic(
                interaction.guild_id
            );

            await interactionResponse(
                interaction,
                "⏹️ Stopped the music and left voice."
            );

            return;
        }


        if (commandName === "pause") {
            const player =
                players.get(
                    interaction.guild_id
                );

            if (!player) {
                await interactionResponse(
                    interaction,
                    "❌ Nothing is playing.",
                    true
                );

                return;
            }

            player.pause();

            await interactionResponse(
                interaction,
                "⏸️ Music paused."
            );

            return;
        }


        if (commandName === "resume") {
            const player =
                players.get(
                    interaction.guild_id
                );

            if (!player) {
                await interactionResponse(
                    interaction,
                    "❌ Nothing is playing.",
                    true
                );

                return;
            }

            player.unpause();

            await interactionResponse(
                interaction,
                "▶️ Music resumed."
            );

            return;
        }


        if (commandName === "skip") {
            const player =
                players.get(
                    interaction.guild_id
                );

            if (!player) {
                await interactionResponse(
                    interaction,
                    "❌ Nothing is playing.",
                    true
                );

                return;
            }

            player.stop();

            await interactionResponse(
                interaction,
                "⏭️ Skipping..."
            );

            return;
        }


        if (commandName === "queue") {
            const queue =
                queues.get(
                    interaction.guild_id
                ) || [];

            if (queue.length === 0) {
                await interactionResponse(
                    interaction,
                    "🎵 The queue is empty."
                );

                return;
            }

            const text =
                queue
                    .map(
                        (song, index) =>
                            `${index + 1}. ${song}`
                    )
                    .join("\n");

            await interactionResponse(
                interaction,
                `🎵 **Cozy Music Queue**\n\n${text}`
            );

            return;
        }

    } catch (error) {
        console.error(
            `❌ Error handling /${commandName}:`
        );

        console.error(error);

        try {
            await interactionResponse(
                interaction,
                "❌ Something went wrong while running that command.",
                true
            );
        } catch (responseError) {
            console.error(
                "❌ Could not send error response:",
                responseError.message
            );
        }
    }
}


/* =========================================================
   GATEWAY
   ========================================================= */

function startGateway() {
    console.log("");
    console.log("========================================");
    console.log("🌐 CONNECTING TO DISCORD GATEWAY");
    console.log("========================================");

    gateway = new WebSocket(
        GATEWAY_URL,
        {
            handshakeTimeout: 30000
        }
    );

    gateway.on(
        "open",
        () => {
            console.log(
                "✅ Gateway WebSocket connected."
            );
        }
    );

    gateway.on(
        "message",
        (raw) => {
            let packet;

            try {
                packet =
                    JSON.parse(
                        raw.toString()
                    );
            } catch (error) {
                console.error(
                    "❌ Could not parse Gateway packet."
                );

                return;
            }

            if (
                packet.s !== undefined &&
                packet.s !== null
            ) {
                sequence =
                    packet.s;
            }

            handleGatewayPacket(
                packet
            );
        }
    );

    gateway.on(
        "close",
        (code, reason) => {
            console.error("");
            console.error(
                "⚠️ Discord Gateway closed."
            );

            console.error(
                "Close code:",
                code
            );

            console.error(
                "Reason:",
                reason?.toString() || "none"
            );

            identified = false;

            if (heartbeatTimer) {
                clearInterval(
                    heartbeatTimer
                );

                heartbeatTimer = null;
            }

            if (heartbeatInterval) {
                clearTimeout(
                    heartbeatInterval
                );

                heartbeatInterval = null;
            }

            scheduleGatewayReconnect();
        }
    );

    gateway.on(
        "error",
        (error) => {
            console.error(
                "❌ Gateway WebSocket error:"
            );

            console.error(error);
        }
    );
}


/* =========================================================
   GATEWAY PACKET HANDLER
   ========================================================= */

function handleGatewayPacket(packet) {
    switch (packet.op) {

        case 10:
            handleHello(
                packet.d
            );
            break;


        case 0:
            handleDispatch(
                packet.t,
                packet.d
            );
            break;


        case 1:
            sendHeartbeat();
            break;


        case 7:
            console.log(
                "🔄 Discord requested reconnect."
            );

            reconnectGateway();
            break;


        case 9:
            console.error(
                "❌ Discord invalidated the session."
            );

            identified = false;

            if (packet.d?.[0] === false) {
                console.error(
                    "❌ Session is not resumable."
                );
            }

            reconnectGateway();
            break;


        case 11:
            console.log(
                "💓 Heartbeat ACK received."
            );
            break;


        default:
            console.log(
                "Gateway opcode:",
                packet.op
            );
    }
}


/* =========================================================
   HELLO
   ========================================================= */

function handleHello(data) {
    console.log("");
    console.log("========================================");
    console.log("🎉 DISCORD HELLO RECEIVED");
    console.log("========================================");

    console.log(
        "Heartbeat interval:",
        data.heartbeat_interval,
        "ms"
    );

    if (heartbeatTimer) {
        clearInterval(
            heartbeatTimer
        );
    }

    heartbeatTimer =
        setInterval(
            sendHeartbeat,
            data.heartbeat_interval
        );

    sendHeartbeat();

    identify();
}


/* =========================================================
   HEARTBEAT
   ========================================================= */

function sendHeartbeat() {
    if (
        !gateway ||
        gateway.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    try {
        gateway.send(
            JSON.stringify({
                op: 1,
                d: sequence
            })
        );

        console.log(
            "💓 Heartbeat sent."
        );
    } catch (error) {
        console.error(
            "❌ Heartbeat failed:",
            error
        );
    }
}


/* =========================================================
   IDENTIFY
   ========================================================= */

function identify() {
    if (identified) {
        return;
    }

    console.log("");
    console.log("========================================");
    console.log("🔐 SENDING IDENTIFY");
    console.log("========================================");

    const payload = {
        op: 2,
        d: {
            token: TOKEN,
            intents: INTENTS,
            properties: {
                os: "linux",
                browser: "cozy-music",
                device: "cozy-music"
            }
        }
    };

    gateway.send(
        JSON.stringify(payload)
    );

    console.log(
        "✅ IDENTIFY sent."
    );
}


/* =========================================================
   DISPATCH
   ========================================================= */

async function handleDispatch(
    eventName,
    data
) {
    if (!eventName) {
        return;
    }

    console.log(
        "📡 Gateway event:",
        eventName
    );

    if (eventName === "READY") {
        botUser =
            data.user;

        identified = true;

        console.log("");
        console.log("========================================");
        console.log("🎉🎉 COZY MUSIC IS ONLINE 🎉🎉");
        console.log("========================================");

        console.log(
            "Bot:",
            botUser.username
        );

        console.log(
            "Bot ID:",
            botUser.id
        );

        console.log(
            "Guilds:",
            data.guilds?.length || 0
        );

        console.log("========================================");

        await registerCommands();

        return;
    }


    if (eventName === "INTERACTION_CREATE") {
        await handleInteraction(
            data
        );

        return;
    }


    if (eventName === "VOICE_STATE_UPDATE") {
        handleVoiceStateUpdate(
            data
        );

        return;
    }


    if (eventName === "VOICE_SERVER_UPDATE") {
        handleVoiceServerUpdate(
            data
        );

        return;
    }
}


/* =========================================================
   RECONNECT
   ========================================================= */

function scheduleGatewayReconnect() {
    if (reconnectTimer) {
        return;
    }

    reconnectTimer =
        setTimeout(
            () => {
                reconnectTimer = null;

                startGateway();
            },
            5000
        );
}

function reconnectGateway() {
    try {
        if (gateway) {
            gateway.close();
        }
    } catch {}

    scheduleGatewayReconnect();
}


/* =========================================================
   START
   ========================================================= */

startGateway();