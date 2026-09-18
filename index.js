require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Events
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} = require("@discordjs/voice");

const express = require("express");
const path = require("path");
const fs = require("fs");

console.log("========================================");
console.log("COZY MUSICAPP STARTING");
console.log("========================================");

console.log("Node.js:", process.version);
console.log("discord.js:", require("discord.js").version);

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("Token will NOT be printed.");

//
// ---------------------------------------------------------
// EXPRESS WEB SERVER
// ---------------------------------------------------------
//

const app = express();

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
    res.send("Cozy Music is running.");
});

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        discordReady: client.isReady()
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
    console.log("========================================");
});

//
// ---------------------------------------------------------
// DISCORD CLIENT
// ---------------------------------------------------------
//

console.log("========================================");
console.log("CREATING DISCORD CLIENT");
console.log("========================================");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],

    ws: {
        handshakeTimeout: 30000,
        helloTimeout: 30000,
        readyTimeout: 60000
    }
});

console.log("Discord client created.");

//
// ---------------------------------------------------------
// DISCORD DEBUG
// ---------------------------------------------------------
//

client.on(Events.Debug, (message) => {
    console.log("DISCORD DEBUG:", message);
});

client.on(Events.Warn, (message) => {
    console.warn("DISCORD WARNING:", message);
});

client.on(Events.Error, (error) => {
    console.error("========================================");
    console.error("❌ DISCORD CLIENT ERROR");
    console.error("========================================");
    console.error("Name:", error?.name);
    console.error("Message:", error?.message);
    console.error("Code:", error?.code);
    console.error(error);
    console.error("========================================");
});

client.on(Events.ShardConnecting, (id) => {
    console.log("========================================");
    console.log("🔵 SHARD CONNECTING");
    console.log("Shard:", id);
    console.log("========================================");
});

client.on(Events.ShardReady, (id) => {
    console.log("========================================");
    console.log("🟢 SHARD READY");
    console.log("Shard:", id);
    console.log("========================================");
});

client.on(Events.ShardReconnecting, (id) => {
    console.log("========================================");
    console.log("🟡 SHARD RECONNECTING");
    console.log("Shard:", id);
    console.log("========================================");
});

client.on(Events.ShardDisconnect, (event, id) => {
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

//
// ---------------------------------------------------------
// DISCORD READY
// ---------------------------------------------------------
//

client.once(Events.ClientReady, (readyClient) => {
    console.log("");
    console.log("========================================");
    console.log("🎉 COZY MUSICAPP ONLINE");
    console.log("========================================");
    console.log("Logged in as:", readyClient.user.tag);
    console.log("Bot ID:", readyClient.user.id);
    console.log(
        "Servers:",
        readyClient.guilds.cache.size
    );
    console.log("========================================");

    //
    // Show connected guilds
    //

    readyClient.guilds.cache.forEach((guild) => {
        console.log(
            "Connected to server:",
            guild.name,
            "|",
            guild.id
        );
    });

    console.log("========================================");
});

//
// ---------------------------------------------------------
// MUSIC SETTINGS
// ---------------------------------------------------------
//

const MUSIC_FOLDER = path.join(
    __dirname,
    "music"
);

const MUSIC_FILE =
    "starlight.mp3.mp3";

const MUSIC_PATH = path.join(
    MUSIC_FOLDER,
    MUSIC_FILE
);

console.log("Music folder:", MUSIC_FOLDER);
console.log("Music file:", MUSIC_PATH);

if (fs.existsSync(MUSIC_PATH)) {
    console.log("✅ Music file found.");
} else {
    console.error("❌ Music file NOT found.");
    console.error("Expected:", MUSIC_PATH);
}

//
// ---------------------------------------------------------
// VOICE STATE
// ---------------------------------------------------------
//

let voiceConnection = null;
let audioPlayer = null;
let audioResource = null;

//
// ---------------------------------------------------------
// FIND VOICE CHANNEL
// ---------------------------------------------------------
//

function getVoiceChannel() {
    const guild = client.guilds.cache.first();

    if (!guild) {
        console.error("❌ Bot is not connected to any guild.");
        return null;
    }

    //
    // Look for a voice channel.
    //

    const voiceChannel = guild.channels.cache.find(
        (channel) =>
            channel.isVoiceBased() &&
            channel.type !== 13
    );

    if (!voiceChannel) {
        console.error(
            "❌ No voice channel found in:",
            guild.name
        );

        return null;
    }

    return voiceChannel;
}

//
// ---------------------------------------------------------
// PLAY MUSIC
// ---------------------------------------------------------
//

async function startMusic() {
    console.log("");
    console.log("========================================");
    console.log("🎵 STARTING MUSIC");
    console.log("========================================");

    if (!client.isReady()) {
        console.error(
            "❌ Discord client is not ready."
        );
        return;
    }

    if (!fs.existsSync(MUSIC_PATH)) {
        console.error(
            "❌ Music file does not exist:"
        );
        console.error(MUSIC_PATH);
        return;
    }

    const voiceChannel = getVoiceChannel();

    if (!voiceChannel) {
        return;
    }

    console.log(
        "🔊 Joining voice channel:",
        voiceChannel.name
    );

    console.log(
        "🆔 Voice Channel ID:",
        voiceChannel.id
    );

    console.log(
        "🆔 Guild ID:",
        voiceChannel.guild.id
    );

    try {
        //
        // Create voice connection
        //

        voiceConnection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator:
                voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        console.log(
            "🔊 Voice connection created."
        );

        //
        // Voice connection state logging
        //

        voiceConnection.on(
            VoiceConnectionStatus.Signalling,
            () => {
                console.log(
                    "📡 Voice state: signalling"
                );
            }
        );

        voiceConnection.on(
            VoiceConnectionStatus.Connecting,
            () => {
                console.log(
                    "📡 Voice state: connecting"
                );
            }
        );

        voiceConnection.on(
            VoiceConnectionStatus.Ready,
            () => {
                console.log(
                    "🟢 Voice connection READY."
                );
            }
        );

        voiceConnection.on(
            VoiceConnectionStatus.Disconnected,
            () => {
                console.log(
                    "🔴 Voice connection DISCONNECTED."
                );
            }
        );

        voiceConnection.on(
            VoiceConnectionStatus.Destroyed,
            () => {
                console.log(
                    "⚫ Voice connection DESTROYED."
                );
            }
        );

        //
        // Wait for voice connection
        //

        try {
            await entersState(
                voiceConnection,
                VoiceConnectionStatus.Ready,
                30000
            );

            console.log(
                "========================================"
            );

            console.log(
                "🟢 VOICE CONNECTION READY"
            );

            console.log(
                "========================================"
            );
        } catch (error) {
            console.error(
                "========================================"
            );

            console.error(
                "❌ VOICE CONNECTION FAILED"
            );

            console.error(
                "========================================"
            );

            console.error(
                error
            );

            console.error(
                "Current state:",
                voiceConnection.state.status
            );

            return;
        }

        //
        // Create audio player
        //

        audioPlayer = createAudioPlayer();

        //
        // Player events
        //

        audioPlayer.on(
            AudioPlayerStatus.Playing,
            () => {
                console.log(
                    "🎵 AUDIO PLAYER PLAYING"
                );
            }
        );

        audioPlayer.on(
            AudioPlayerStatus.Idle,
            () => {
                console.log(
                    "⏹️ AUDIO PLAYER IDLE"
                );
            }
        );

        audioPlayer.on(
            "error",
            (error) => {
                console.error(
                    "❌ AUDIO PLAYER ERROR"
                );

                console.error(error);
            }
        );

        //
        // Subscribe voice connection
        //

        voiceConnection.subscribe(
            audioPlayer
        );

        //
        // Create audio resource
        //

        console.log(
            "Creating audio resource..."
        );

        audioResource = createAudioResource(
            MUSIC_PATH,
            {
                inputType: 0
            }
        );

        //
        // Play
        //

        console.log(
            "Starting audio playback..."
        );

        audioPlayer.play(audioResource);

        console.log(
            "========================================"
        );

        console.log(
            "🎵 MUSIC STARTED"
        );

        console.log(
            "========================================"
        );

    } catch (error) {
        console.error(
            "❌ MUSIC START ERROR"
        );

        console.error(error);
    }
}

//
// ---------------------------------------------------------
// TEST COMMAND
// ---------------------------------------------------------
//

client.on(
    Events.MessageCreate,
    async (message) => {

        if (message.author.bot) {
            return;
        }

        if (message.content === "!music") {
            console.log(
                "🎵 !music used by",
                message.author.tag
            );

            await message.reply(
                "🎵 Starting Cozy Music..."
            );

            await startMusic();
        }
    }
);

//
// ---------------------------------------------------------
// LOGIN
// ---------------------------------------------------------
//

console.log("");
console.log("========================================");
console.log("ATTEMPTING DISCORD LOGIN");
console.log("========================================");

client.login(
    process.env.DISCORD_TOKEN
)
.then(() => {
    console.log(
        "client.login() promise resolved."
    );
})
.catch((error) => {
    console.error("");
    console.error("========================================");
    console.error("❌ DISCORD LOGIN FAILED");
    console.error("========================================");
    console.error("Name:", error?.name);
    console.error("Message:", error?.message);
    console.error("Code:", error?.code);
    console.error(error);
    console.error("========================================");
});