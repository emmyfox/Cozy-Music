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

console.log("========================================");
console.log("COZY MUSICAPP STARTING");
console.log("========================================");
console.log("Node.js:", process.version);

function getPackageVersion(packageName) {
    try {
        const packageMain = require.resolve(packageName);
        const packageRoot = path.resolve(
            path.dirname(packageMain),
            ".."
        );

        const packageJsonPath = path.join(
            packageRoot,
            "package.json"
        );

        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
        );

        return packageJson.version;
    } catch {
        return "unknown";
    }
}

console.log(
    "discord.js:",
    getPackageVersion("discord.js")
);

console.log(
    "@discordjs/voice:",
    getPackageVersion("@discordjs/voice")
);

console.log(
    "opusscript:",
    getPackageVersion("opusscript")
);

console.log("========================================");
console.log("");

if (!process.env.DISCORD_TOKEN) {
    console.error("========================================");
    console.error("ERROR: DISCORD_TOKEN IS MISSING");
    console.error("========================================");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("");

const PORT = process.env.PORT || 10000;

const app = express();

app.get("/", (req, res) => {
    res.send("Cozy MusicAPP is online!");
});

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        node: process.version
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
    console.log("");
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

console.log("Discord client created.");

client.on("error", (error) => {
    console.error("");
    console.error("========================================");
    console.error("DISCORD CLIENT ERROR");
    console.error("========================================");
    console.error(error);
});

client.on("warn", (message) => {
    console.warn("");
    console.warn("========================================");
    console.warn("DISCORD CLIENT WARNING");
    console.warn("========================================");
    console.warn(message);
});

client.on("debug", (message) => {
    let safeMessage = String(message);

    safeMessage = safeMessage.replace(
        /Provided token: .*/gi,
        "Provided token: [REDACTED]"
    );

    safeMessage = safeMessage.replace(
        /token=([^\s&]+)/gi,
        "token=[REDACTED]"
    );

    console.log(
        "DISCORD DEBUG:",
        safeMessage
    );
});

client.on("shardError", (error, shardId) => {
    console.error("");
    console.error("========================================");
    console.error("DISCORD SHARD ERROR");
    console.error("========================================");
    console.error("Shard:", shardId);
    console.error(error);
});

client.on("shardReconnecting", (shardId) => {
    console.log("");
    console.log("========================================");
    console.log("DISCORD SHARD RECONNECTING");
    console.log("========================================");
    console.log("Shard:", shardId);
});

client.on("shardDisconnect", (event, shardId) => {
    console.log("");
    console.log("========================================");
    console.log("DISCORD SHARD DISCONNECTED");
    console.log("========================================");
    console.log("Shard:", shardId);
    console.log("Code:", event?.code);
    console.log(
        "Reason:",
        event?.reason || "No reason supplied"
    );
});

client.on("shardReady", (shardId) => {
    console.log("");
    console.log("========================================");
    console.log("DISCORD SHARD READY");
    console.log("========================================");
    console.log("Shard:", shardId);
});

const commands = [
    new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play Cozy Music")
        .toJSON()
];

async function registerCommands() {
    try {
        console.log("");
        console.log("========================================");
        console.log("REGISTERING SLASH COMMAND");
        console.log("========================================");

        const rest = new REST({
            version: "10"
        }).setToken(
            process.env.DISCORD_TOKEN
        );

        await rest.put(
            Routes.applicationCommands(
                client.user.id
            ),
            {
                body: commands
            }
        );

        console.log(
            "Slash command registered successfully."
        );

        console.log("");
    } catch (error) {
        console.error("");
        console.error("========================================");
        console.error("SLASH COMMAND REGISTRATION FAILED");
        console.error("========================================");
        console.error(error);
    }
}

async function runBasicUDPTest() {
    console.log("");
    console.log("========================================");
    console.log("BASIC UDP CONNECTIVITY TEST");
    console.log("========================================");

    console.log("Test 1: DNS resolution");

    try {
        const addresses = await new Promise(
            (resolve, reject) => {
                dns.resolve4(
                    "discord.com",
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result);
                        }
                    }
                );
            }
        );

        console.log("DNS works.");
        console.log("discord.com IPv4 addresses:");

        for (const address of addresses) {
            console.log("   " + address);
        }
    } catch (error) {
        console.error("DNS failed:");
        console.error(error);
    }

    console.log("");
    console.log("Test 2: Creating UDP socket");

    const socket = dgram.createSocket("udp4");

    try {
        await new Promise(
            (resolve, reject) => {
                socket.once("error", reject);

                socket.bind(
                    0,
                    "0.0.0.0",
                    () => {
                        resolve();
                    }
                );
            }
        );

        const address = socket.address();

        console.log(
            "UDP socket successfully created."
        );

        console.log(
            "Local address:",
            address.address
        );

        console.log(
            "Local port:",
            address.port
        );
    } catch (error) {
        console.error(
            "UDP socket creation failed:"
        );

        console.error(error);

        try {
            socket.close();
        } catch {}

        return;
    }

    console.log("");
    console.log("Test 3: Sending generic UDP packet");

    try {
        const packet = Buffer.from(
            "Cozy Music UDP test"
        );

        await new Promise(
            (resolve, reject) => {
                socket.send(
                    packet,
                    0,
                    packet.length,
                    443,
                    "discord.com",
                    (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                );
            }
        );

        console.log(
            "Generic UDP packet sent successfully."
        );
    } catch (error) {
        console.error(
            "Generic UDP send failed:"
        );

        console.error(error);
    }

    console.log("");
    console.log("========================================");
    console.log("BASIC UDP TEST COMPLETE");
    console.log("========================================");
    console.log("");

    try {
        socket.close();
    } catch {}
}

function getNetworkingState(connection) {
    try {
        if (!connection.state.networking) {
            return null;
        }

        return connection.state.networking.state;
    } catch {
        return null;
    }
}

function logNetworkingState(connection) {
    const networking =
        getNetworkingState(connection);

    if (!networking) {
        console.log(
            "Networking state: unavailable"
        );

        return;
    }

    console.log(
        "Networking state:",
        networking.code
    );

    console.log(
        "Networking WebSocket:",
        networking.ws
            ? "present"
            : "missing"
    );

    console.log(
        "Networking UDP:",
        networking.udp
            ? "present"
            : "missing"
    );
}

async function playMusic(interaction) {
    let connection = null;

    try {
        console.log("");
        console.log("========================================");
        console.log("/play COMMAND RECEIVED");
        console.log("========================================");

        console.log(
            "Used by:",
            interaction.user.username
        );

        await interaction.deferReply();

        console.log(
            "Discord interaction acknowledged."
        );

        const member =
            interaction.member;

        if (!member) {
            await interaction.editReply(
                "I couldn't find your Discord member information."
            );

            return;
        }

        const voiceChannel =
            member.voice?.channel;

        if (!voiceChannel) {
            await interaction.editReply(
                "You need to be in a voice channel first."
            );

            return;
        }

        console.log(
            "Joining voice channel:",
            voiceChannel.name
        );

        console.log(
            "Voice Channel ID:",
            voiceChannel.id
        );

        console.log(
            "Guild ID:",
            voiceChannel.guild.id
        );

        connection = joinVoiceChannel({
            channelId:
                voiceChannel.id,

            guildId:
                voiceChannel.guild.id,

            adapterCreator:
                voiceChannel.guild
                    .voiceAdapterCreator,

            selfDeaf: true,
            selfMute: false,
            debug: true
        });

        console.log(
            "Voice connection created."
        );

        console.log(
            "Initial voice state:",
            connection.state.status
        );

        connection.on(
            "stateChange",
            (oldState, newState) => {
                console.log(
                    "Voice state:",
                    oldState.status,
                    "->",
                    newState.status
                );

                logNetworkingState(
                    connection
                );

                if (
                    newState.status ===
                    VoiceConnectionStatus.Ready
                ) {
                    console.log("");
                    console.log(
                        "========================================"
                    );

                    console.log(
                        "DISCORD VOICE CONNECTION IS READY"
                    );

                    console.log(
                        "========================================"
                    );
                }
            }
        );

        connection.on(
            "debug",
            (message) => {
                let safeMessage =
                    String(message);

                safeMessage =
                    safeMessage.replace(
                        /("token":")([^"]+)(")/g,
                        "$1[REDACTED]$3"
                    );

                safeMessage =
                    safeMessage.replace(
                        /("session_id":")([^"]+)(")/g,
                        "$1[REDACTED]$3"
                    );

                safeMessage =
                    safeMessage.replace(
                        /("sessionId":")([^"]+)(")/g,
                        "$1[REDACTED]$3"
                    );

                console.log(
                    "VOICE DEBUG:",
                    safeMessage
                );
            }
        );

        connection.on(
            "error",
            (error) => {
                console.error("");
                console.error(
                    "========================================"
                );

                console.error(
                    "VOICE CONNECTION ERROR"
                );

                console.error(
                    "========================================"
                );

                console.error(error);
            }
        );

        console.log("");
        console.log(
            "Waiting for Discord Voice..."
        );

        let ready = false;

        for (
            let attempt = 1;
            attempt <= 20;
            attempt++
        ) {
            console.log(
                "Voice check",
                attempt + "/20"
            );

            console.log(
                "Current voice state:",
                connection.state.status
            );

            logNetworkingState(
                connection
            );

            if (
                connection.state.status ===
                VoiceConnectionStatus.Ready
            ) {
                ready = true;
                break;
            }

            const networking =
                getNetworkingState(
                    connection
                );

            if (
                networking &&
                networking.code === 6
            ) {
                console.log("");
                console.log(
                    "Discord networking closed before UDP became ready."
                );

                break;
            }

            await new Promise(
                (resolve) =>
                    setTimeout(
                        resolve,
                        1000
                    )
            );
        }

        if (!ready) {
            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "VOICE CONNECTION DID NOT REACH READY"
            );

            console.log(
                "========================================"
            );

            console.log(
                "Current voice state:",
                connection.state.status
            );

            logNetworkingState(
                connection
            );

            await interaction.editReply(
                "Discord Voice closed before the connection became ready. Check the Render logs."
            );

            try {
                connection.destroy();
            } catch {}

            return;
        }

        const musicFile =
            path.join(
                __dirname,
                "music",
                "starlight.mp3.mp3"
            );

        console.log("");
        console.log(
            "Checking music file:"
        );

        console.log(
            musicFile
        );

        if (
            !fs.existsSync(
                musicFile
            )
        ) {
            console.error(
                "Music file does not exist."
            );

            await interaction.editReply(
                "I connected to voice, but I couldn't find the music file."
            );

            try {
                connection.destroy();
            } catch {}

            return;
        }

        const stats =
            fs.statSync(
                musicFile
            );

        console.log(
            "Music file found."
        );

        console.log(
            "File size:",
            stats.size,
            "bytes"
        );

        const player =
            createAudioPlayer();

        player.on(
            "stateChange",
            (oldState, newState) => {
                console.log(
                    "Audio player:",
                    oldState.status,
                    "->",
                    newState.status
                );
            }
        );

        player.on(
            "error",
            (error) => {
                console.error(
                    "Audio player error:"
                );

                console.error(error);
            }
        );

        const resource =
            createAudioResource(
                musicFile
            );

        connection.subscribe(
            player
        );

        player.play(
            resource
        );

        console.log(
            "Cozy Music is playing."
        );

        await interaction.editReply(
            "Cozy Music is now playing!"
        );

        player.on(
            AudioPlayerStatus.Idle,
            () => {
                console.log(
                    "Song finished - restarting..."
                );

                try {
                    const nextResource =
                        createAudioResource(
                            musicFile
                        );

                    player.play(
                        nextResource
                    );
                } catch (error) {
                    console.error(
                        "Could not restart music:"
                    );

                    console.error(error);
                }
            }
        );

    } catch (error) {
        console.error("");
        console.error(
            "========================================"
        );

        console.error(
            "/PLAY ERROR"
        );

        console.error(
            "========================================"
        );

        console.error(error);

        try {
            if (
                interaction.deferred
            ) {
                await interaction.editReply(
                    "Something went wrong while connecting to Discord Voice. Check the Render logs."
                );
            } else {
                await interaction.reply(
                    "Something went wrong while connecting to Discord Voice."
                );
            }
        } catch (replyError) {
            console.error(
                "Could not send Discord error message:"
            );

            console.error(
                replyError
            );
        }

        if (connection) {
            try {
                connection.destroy();
            } catch {}
        }
    }
}

client.once(
    "ready",
    async () => {
        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "COZY MUSICAPP ONLINE"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Logged in as:",
            client.user.tag
        );

        console.log(
            "Bot ID:",
            client.user.id
        );

        console.log(
            "Discord client is READY."
        );

        await registerCommands();

        await runBasicUDPTest();
    }
);

client.on(
    "interactionCreate",
    async (interaction) => {
        console.log(
            "Interaction received:",
            interaction.type
        );

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        console.log(
            "Command:",
            interaction.commandName
        );

        if (
            interaction.commandName ===
            "play"
        ) {
            await playMusic(
                interaction
            );
        }
    }
);

console.log(
    "Attempting Discord login..."
);

client.login(
    process.env.DISCORD_TOKEN
)
    .then(() => {
        console.log(
            "Discord login request completed."
        );
    })
    .catch((error) => {
        console.error("");
        console.error(
            "========================================"
        );

        console.error(
            "DISCORD LOGIN FAILED"
        );

        console.error(
            "========================================"
        );

        console.error(error);

        process.exit(1);
    });

process.on(
    "unhandledRejection",
    (error) => {
        console.error("");
        console.error(
            "UNHANDLED PROMISE REJECTION"
        );

        console.error(error);
    }
);

process.on(
    "uncaughtException",
    (error) => {
        console.error("");
        console.error(
            "UNCAUGHT EXCEPTION"
        );

        console.error(
            "========================================"
        );

        console.error(error);
    }
);