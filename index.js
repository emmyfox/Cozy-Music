require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

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
    AudioPlayerStatus,
    entersState
} = require('@discordjs/voice');

// ==========================================
// CHECK DISCORD TOKEN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing!');
    console.error(
        'Add DISCORD_TOKEN to your Render Environment Variables.'
    );
    process.exit(1);
}

// ==========================================
// EXPRESS WEB SERVER
// ==========================================

const app = express();

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('🎶 Cozy Music Bot is alive!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ==========================================
// DISCORD CLIENT
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// BOT READY
// ==========================================

client.once('clientReady', async () => {

    console.log('🤖 COZY MUSIC BOT ONLINE');
    console.log(`👤 Logged in as ${client.user.tag}`);

    // ==========================================
    // REGISTER SLASH COMMAND
    // ==========================================

    const commands = [
        {
            name: 'play',
            description: 'Join your voice channel and play cozy music.'
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

        console.log('✅ Slash command registered.');

    } catch (error) {

        console.error(
            '❌ Failed to register slash command:'
        );

        console.error(error);
    }
});

// ==========================================
// /PLAY COMMAND
// ==========================================

client.on('interactionCreate', async interaction => {

    // Ignore anything that isn't a slash command
    if (!interaction.isChatInputCommand()) {
        return;
    }

    // Only handle /play
    if (interaction.commandName !== 'play') {
        return;
    }

    console.log(
        `🎵 /play used by ${interaction.user.tag}`
    );

    try {

        // ==========================================
        // ACKNOWLEDGE DISCORD
        // ==========================================

        await interaction.deferReply();

        // ==========================================
        // CHECK VOICE CHANNEL
        // ==========================================

        const voiceChannel =
            interaction.member?.voice?.channel;

        if (!voiceChannel) {

            await interaction.editReply(
                '❌ You need to be in a voice channel first!'
            );

            return;
        }

        console.log(
            `🔊 Joining voice channel: ${voiceChannel.name}`
        );

        console.log(
            `🆔 Voice Channel ID: ${voiceChannel.id}`
        );

        console.log(
            `🆔 Guild ID: ${voiceChannel.guild.id}`
        );

        // ==========================================
        // JOIN VOICE
        // ==========================================

        const connection = joinVoiceChannel({

            channelId: voiceChannel.id,

            guildId: voiceChannel.guild.id,

            adapterCreator:
                voiceChannel.guild.voiceAdapterCreator,

            selfDeaf: true,

            selfMute: false,

            // IMPORTANT:
            // Turn on voice debugging.
            debug: true
        });

        console.log(
            '🔊 Voice connection created.'
        );

        console.log(
            `📡 Initial voice state: ${connection.state.status}`
        );

        // ==========================================
        // VOICE CONNECTION STATE CHANGES
        // ==========================================

        connection.on(
            'stateChange',
            (oldState, newState) => {

                console.log(
                    `📡 Voice state: ${oldState.status} -> ${newState.status}`
                );

                // ======================================
                // LOG NETWORKING STATE
                // ======================================

                if (newState.networking) {

                    console.log(
                        `🌐 Networking state: ${newState.networking.state.code}`
                    );

                    const networking =
                        newState.networking;

                    networking.on(
                        'debug',
                        message => {

                            console.log(
                                `🌐 VOICE DEBUG: ${message}`
                            );
                        }
                    );

                    networking.on(
                        'error',
                        error => {

                            console.error(
                                '❌❌❌ VOICE NETWORK ERROR ❌❌❌'
                            );

                            console.error(error);

                            console.error(
                                'Network error message:',
                                error.message
                            );

                            console.error(
                                'Network error stack:',
                                error.stack
                            );
                        }
                    );
                }
            }
        );

        // ==========================================
        // VOICE CONNECTION ERROR
        // ==========================================

        connection.on(
            'error',
            error => {

                console.error(
                    '❌❌❌ VOICE CONNECTION ERROR ❌❌❌'
                );

                console.error(error);

                console.error(
                    'Voice error message:',
                    error.message
                );

                console.error(
                    'Voice error stack:',
                    error.stack
                );
            }
        );

        // ==========================================
        // WAIT FOR VOICE CONNECTION
        // ==========================================

        try {

            console.log(
                '⏳ Waiting for Discord voice connection...'
            );

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                30000
            );

            console.log(
                '✅✅✅ DISCORD VOICE CONNECTION READY! ✅✅✅'
            );

        } catch (error) {

            console.error(
                '❌❌❌ VOICE CONNECTION FAILED ❌❌❌'
            );

            console.error(
                `Current voice state: ${connection.state.status}`
            );

            console.error(
                'Voice connection error:',
                error
            );

            if (connection.state.networking) {

                console.error(
                    'Final networking state:',
                    connection.state.networking.state.code
                );
            }

            connection.destroy();

            await interaction.editReply(
                '❌ Discord could not establish the voice connection. Check the Render logs for the detailed voice/network error.'
            );

            return;
        }

        // ==========================================
        // CREATE AUDIO PLAYER
        // ==========================================

        console.log(
            '🎵 Creating audio player...'
        );

        const player = createAudioPlayer();

        console.log(
            '🎵 Audio player created.'
        );

        // ==========================================
        // SUBSCRIBE PLAYER
        // ==========================================

        connection.subscribe(player);

        console.log(
            '🔗 Audio player subscribed to voice connection.'
        );

        // ==========================================
        // FIND MUSIC FILE
        // ==========================================

        const audioPath = path.join(
            __dirname,
            'music',
            'starlight.mp3.mp3'
        );

        console.log(
            `🎧 Looking for music file: ${audioPath}`
        );

        // ==========================================
        // CHECK MUSIC FILE
        // ==========================================

        if (!fs.existsSync(audioPath)) {

            console.error(
                '❌ starlight.mp3.mp3 was not found!'
            );

            connection.destroy();

            await interaction.editReply(
                '❌ I cannot find music/starlight.mp3.mp3.'
            );

            return;
        }

        console.log(
            '✅ music/starlight.mp3.mp3 found!'
        );

        // ==========================================
        // CHECK FILE SIZE
        // ==========================================

        const fileStats = fs.statSync(audioPath);

        console.log(
            `📦 Music file size: ${fileStats.size} bytes`
        );

        if (fileStats.size === 0) {

            console.error(
                '❌ Music file is empty!'
            );

            connection.destroy();

            await interaction.editReply(
                '❌ The music file is empty.'
            );

            return;
        }

        // ==========================================
        // CREATE AUDIO RESOURCE
        // ==========================================

        const createMusicResource = () => {

            console.log(
                '🎧 Creating audio resource...'
            );

            const resource = createAudioResource(
                audioPath,
                {
                    inputType: StreamType.Arbitrary
                }
            );

            console.log(
                '✅ Audio resource created.'
            );

            return resource;
        };

        // ==========================================
        // PLAY MUSIC
        // ==========================================

        const playMusic = () => {

            try {

                console.log(
                    '▶️ Starting music...'
                );

                const resource =
                    createMusicResource();

                player.play(resource);

                console.log(
                    '▶️ player.play(resource) called.'
                );

            } catch (error) {

                console.error(
                    '❌❌❌ ERROR STARTING MUSIC ❌❌❌'
                );

                console.error(error);
            }
        };

        // ==========================================
        // AUDIO PLAYER STATE
        // ==========================================

        player.on(
            'stateChange',
            (oldState, newState) => {

                console.log(
                    `🎵 Audio player state: ${oldState.status} -> ${newState.status}`
                );

                if (
                    newState.status ===
                    AudioPlayerStatus.Playing
                ) {

                    console.log(
                        '🔊🔊🔊 MUSIC IS PLAYING! 🔊🔊🔊'
                    );
                }

                if (
                    newState.status ===
                    AudioPlayerStatus.Idle
                ) {

                    console.log(
                        '💤 Audio player is idle.'
                    );
                }

                if (
                    newState.status ===
                    AudioPlayerStatus.AutoPaused
                ) {

                    console.log(
                        '⏸️ Audio player auto-paused.'
                    );
                }
            }
        );

        // ==========================================
        // AUDIO PLAYER ERROR
        // ==========================================

        player.on(
            'error',
            error => {

                console.error(
                    '❌❌❌ AUDIO PLAYER ERROR ❌❌❌'
                );

                console.error(error);

                console.error(
                    'Error message:',
                    error.message
                );

                console.error(
                    'Error stack:',
                    error.stack
                );
            }
        );

        // ==========================================
        // LOOP MUSIC
        // ==========================================

        player.on(
            'idle',
            () => {

                console.log(
                    '🔁 Music finished. Restarting...'
                );

                playMusic();
            }
        );

        // ==========================================
        // START MUSIC
        // ==========================================

        playMusic();

        // ==========================================
        // CONFIRM TO USER
        // ==========================================

        await interaction.editReply(
            '🎶 Cozy music stream started successfully!'
        );

    } catch (error) {

        console.error(
            '❌❌❌ ERROR RUNNING /PLAY ❌❌❌'
        );

        console.error(error);

        try {

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply(
                    '❌ Something went wrong starting the music.'
                );

            } else {

                await interaction.reply(
                    '❌ Something went wrong starting the music.'
                );
            }

        } catch (replyError) {

            console.error(
                '❌ Could not send error reply:'
            );

            console.error(replyError);
        }
    }
});

// ==========================================
// DISCORD CLIENT ERRORS
// ==========================================

client.on(
    'error',
    error => {

        console.error(
            '❌ DISCORD CLIENT ERROR'
        );

        console.error(error);
    }
);

// ==========================================
// LOGIN
// ==========================================

console.log(
    '🔑 Logging into Discord...'
);

client.login(
    process.env.DISCORD_TOKEN
);