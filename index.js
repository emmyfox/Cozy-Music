const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    StreamType,
    entersState,
    AudioPlayerStatus
} = require('@discordjs/voice');

const express = require('express');
const fs = require('fs');
const path = require('path');

// =====================================================
// SETTINGS
// =====================================================

process.env.IPV4_ONLY = 'true';

const PORT = process.env.PORT || 10000;

// How long to wait before trying to reconnect
const RECONNECT_DELAY = 5000;

// =====================================================
// WEB SERVER
// =====================================================

const app = express();

app.get('/', (req, res) => {
    res.send('🎶 Cozy Music Bot is alive and streaming!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// =====================================================
// MUSIC STATE
// =====================================================

// The bot remembers the last place it was playing.
let currentGuildId = null;
let currentChannelId = null;

// Current voice connection
let connection = null;

// Current audio player
let player = null;

// Prevent multiple reconnect attempts
let reconnecting = false;

// Whether the music session should continue
let musicSessionActive = false;

// =====================================================
// MUSIC FILE
// =====================================================

const audioPath = path.join(
    __dirname,
    'music.mp3'
);

// =====================================================
// CHECK MUSIC FILE
// =====================================================

if (fs.existsSync(audioPath)) {

    console.log(
        `🎧 Music file found: ${audioPath}`
    );

} else {

    console.error(
        `❌ WARNING: music.mp3 was not found at: ${audioPath}`
    );
}

// =====================================================
// BOT READY
// =====================================================

client.once('ready', async () => {

    console.log('========================================');
    console.log('🤖 COZY MUSIC BOT ONLINE');
    console.log(`👤 Logged in as ${client.user.tag}`);
    console.log('========================================');

    const commands = [
        {
            name: 'play',
            description:
                'Start streaming cozy music in your voice channel'
        }
    ];

    const rest = new REST({ version: '10' })
        .setToken(process.env.DISCORD_TOKEN);

    try {

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log(
            '✅ Slash commands registered.'
        );

    } catch (error) {

        console.error(
            '❌ Failed to register slash commands:',
            error
        );
    }
});

// =====================================================
// CREATE AUDIO PLAYER
// =====================================================

function createMusicPlayer() {

    // If a player already exists, destroy the old one
    if (player) {

        try {
            player.stop();
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    player = createAudioPlayer();

    // -------------------------------------------------
    // MUSIC FINISHED
    // -------------------------------------------------

    player.on(
        AudioPlayerStatus.Idle,
        () => {

            if (!musicSessionActive) {
                return;
            }

            console.log(
                '🔁 Music finished. Restarting...'
            );

            playMusic();
        }
    );

    // -------------------------------------------------
    // PLAYER ERROR
    // -------------------------------------------------

    player.on(
        'error',
        error => {

            console.error(
                '❌ Audio player error:',
                error
            );

            if (musicSessionActive) {

                console.log(
                    '🔄 Restarting audio player...'
                );

                setTimeout(() => {

                    if (musicSessionActive) {
                        playMusic();
                    }

                }, 2000);
            }
        }
    );

    return player;
}

// =====================================================
// PLAY MUSIC
// =====================================================

function playMusic() {

    if (!musicSessionActive) {
        return;
    }

    if (!connection) {

        console.log(
            '⚠️ No voice connection available.'
        );

        return;
    }

    if (!fs.existsSync(audioPath)) {

        console.error(
            '❌ Cannot play music.mp3 because it does not exist.'
        );

        return;
    }

    try {

        console.log(
            '▶️ Starting music...'
        );

        const resource = createAudioResource(
            audioPath,
            {
                inputType: StreamType.Arbitrary
            }
        );

        // Make sure we have a player
        if (!player) {
            createMusicPlayer();
        }

        // Subscribe player to connection
        connection.subscribe(player);

        player.play(resource);

        console.log(
            '🎵 Music is playing.'
        );

    } catch (error) {

        console.error(
            '❌ Could not start music:',
            error
        );

        if (musicSessionActive) {

            setTimeout(() => {

                playMusic();

            }, 3000);
        }
    }
}

// =====================================================
// CONNECT TO VOICE
// =====================================================

async function connectToVoice() {

    if (!musicSessionActive) {
        return;
    }

    if (!currentGuildId || !currentChannelId) {

        console.log(
            '❌ I do not know which voice channel to reconnect to.'
        );

        return;
    }

    try {

        const guild = client.guilds.cache.get(
            currentGuildId
        );

        if (!guild) {

            console.error(
                '❌ Could not find the Discord server.'
            );

            return;
        }

        const voiceChannel = guild.channels.cache.get(
            currentChannelId
        );

        if (!voiceChannel) {

            console.error(
                '❌ Could not find the voice channel.'
            );

            return;
        }

        console.log(
            `🔊 Connecting to ${voiceChannel.name}...`
        );

        // Destroy old connection if one exists
        if (connection) {

            try {
                connection.destroy();
            } catch (error) {
                // Ignore cleanup errors
            }

            connection = null;
        }

        // Create new connection
        connection = joinVoiceChannel({

            channelId: voiceChannel.id,

            guildId: guild.id,

            adapterCreator:
                guild.voiceAdapterCreator,

            selfDeaf: true
        });

        console.log(
            '🔊 Voice connection created.'
        );

        // -------------------------------------------------
        // CONNECTION READY
        // -------------------------------------------------

        try {

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                15000
            );

            console.log(
                '✅ Voice connection is ready.'
            );

            reconnecting = false;

            // Create a fresh player
            createMusicPlayer();

            // Start music
            playMusic();

        } catch (error) {

            console.error(
                '❌ Voice connection did not become ready:',
                error
            );

            connection.destroy();

            connection = null;

            scheduleReconnect();
        }

        // -------------------------------------------------
        // CONNECTION DISCONNECTED
        // -------------------------------------------------

        connection.on(
            VoiceConnectionStatus.Disconnected,
            () => {

                console.log(
                    '⚠️ Discord voice connection disconnected!'
                );

                if (musicSessionActive) {

                    scheduleReconnect();
                }
            }
        );

        // -------------------------------------------------
        // CONNECTION DESTROYED
        // -------------------------------------------------

        connection.on(
            VoiceConnectionStatus.Destroyed,
            () => {

                console.log(
                    '⚠️ Voice connection destroyed.'
                );

                if (musicSessionActive) {

                    scheduleReconnect();
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ Voice connection error:',
            error
        );

        connection = null;

        if (musicSessionActive) {

            scheduleReconnect();
        }
    }
}

// =====================================================
// AUTOMATIC RECONNECT
// =====================================================

function scheduleReconnect() {

    if (!musicSessionActive) {
        return;
    }

    if (reconnecting) {
        return;
    }

    reconnecting = true;

    console.log(
        `🔄 Automatic reconnect in ${RECONNECT_DELAY / 1000} seconds...`
    );

    setTimeout(async () => {

        reconnecting = false;

        if (!musicSessionActive) {
            return;
        }

        console.log(
            '🔄 Attempting automatic reconnect...'
        );

        await connectToVoice();

    }, RECONNECT_DELAY);
}

// =====================================================
// /PLAY COMMAND
// =====================================================

client.on(
    'interactionCreate',
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        if (interaction.commandName !== 'play') {
            return;
        }

        console.log(
            `🎵 /play used by ${interaction.user.tag}`
        );

        try {

            // Respond immediately
            await interaction.deferReply();

            // ---------------------------------------------
            // CHECK USER VOICE CHANNEL
            // ---------------------------------------------

            const member = interaction.member;

            const voiceChannel =
                member?.voice?.channel;

            if (!voiceChannel) {

                await interaction.editReply(
                    '❌ You need to be in a voice channel first!'
                );

                return;
            }

            // ---------------------------------------------
            // SAVE MUSIC LOCATION
            // ---------------------------------------------

            currentGuildId =
                voiceChannel.guild.id;

            currentChannelId =
                voiceChannel.id;

            // Tell the reconnect system to keep running
            musicSessionActive = true;

            reconnecting = false;

            console.log(
                `📌 Remembering voice channel: ${voiceChannel.name}`
            );

            // ---------------------------------------------
            // CONNECT
            // ---------------------------------------------

            await connectToVoice();

            // ---------------------------------------------
            // DISCORD RESPONSE
            // ---------------------------------------------

            await interaction.editReply(
                '🎶 Cozy music started! I will automatically reconnect if the voice connection drops.'
            );

        } catch (error) {

            console.error(
                '❌ /play error:',
                error
            );

            try {

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.editReply(
                        '❌ Something went wrong starting the music. Check the Render logs.'
                    );

                } else {

                    await interaction.reply({
                        content:
                            '❌ Something went wrong starting the music.',
                        ephemeral: true
                    });
                }

            } catch (replyError) {

                console.error(
                    '❌ Could not send Discord error reply:',
                    replyError
                );
            }
        }
    }
);

// =====================================================
// DISCORD CLIENT ERROR
// =====================================================

client.on(
    'error',
    error => {

        console.error(
            '❌ Discord client error:',
            error
        );
    }
);

// =====================================================
// DISCORD SHARD DISCONNECT
// =====================================================

client.on(
    'shardDisconnect',
    (event, shardId) => {

        console.log(
            `⚠️ Discord connection lost on shard ${shardId}.`
        );

        if (musicSessionActive) {

            console.log(
                '🔄 Discord should reconnect automatically...'
            );
        }
    }
);

// =====================================================
// CHECK TOKEN
// =====================================================

if (!process.env.DISCORD_TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN is missing from Render Environment Variables!'
    );

    process.exit(1);
}

// =====================================================
// LOGIN
// =====================================================

console.log(
    '🔑 Logging into Discord...'
);

client.login(
    process.env.DISCORD_TOKEN
);