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
            '❌ Failed to register slash command:',
            error
        );
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

        // ==========================================
        // JOIN VOICE
        // ==========================================

        const connection = joinVoiceChannel({

            channelId: voiceChannel.id,

            guildId: voiceChannel.guild.id,

            adapterCreator:
                voiceChannel.guild.voiceAdapterCreator,

            selfDeaf: true
        });

        console.log(
            '🔊 Voice connection created.'
        );

        // ==========================================
        // WAIT FOR VOICE CONNECTION
        // ==========================================

        try {

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                15000
            );

            console.log(
                '✅ Discord voice connection is READY!'
            );

        } catch (error) {

            console.error(
                '❌ Voice connection did not become ready.'
            );

            console.error(error);

            connection.destroy();

            await interaction.editReply(
                '❌ I joined the voice channel, but Discord did not establish the voice connection.'
            );

            return;
        }

        // ==========================================
        // HANDLE VOICE DISCONNECT
        // ==========================================

        connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {

                console.log(
                    '⚠️ Voice connection disconnected.'
                );

                try {

                    await Promise.race([

                        entersState(
                            connection,
                            VoiceConnectionStatus.Signalling,
                            5000
                        ),

                        entersState(
                            connection,
                            VoiceConnectionStatus.Connecting,
                            5000
                        )

                    ]);

                    console.log(
                        '🔄 Voice connection recovering...'
                    );

                } catch {

                    console.log(
                        '❌ Voice connection could not recover.'
                    );

                    connection.destroy();
                }
            }
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
                '❌ I cannot find music/starlight.mp3.mp3. Make sure the file is inside the music folder on GitHub.'
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
        // CREATE AUDIO PLAYER
        // ==========================================

        const player = createAudioPlayer();

        console.log(
            '🎵 Audio player created.'
        );

        // ==========================================
        // SUBSCRIBE PLAYER TO VOICE CONNECTION
        // ==========================================

        connection.subscribe(player);

        console.log(
            '🔗 Audio player subscribed to voice connection.'
        );

        // ==========================================
        // PLAY MUSIC FUNCTION
        // ==========================================

        const playMusic = () => {

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

                console.log(
                    '🎧 Audio resource created.'
                );

                player.play(resource);

                console.log(
                    '▶️ player.play(resource) called.'
                );

            } catch (error) {

                console.error(
                    '❌ Error starting music:'
                );

                console.error(error);
            }
        };

        // ==========================================
        // AUDIO PLAYER STATE CHANGES
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
                        '⏸️ Audio player was auto-paused.'
                    );
                }
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
        // AUDIO ERRORS
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
            '❌ Error running /play:'
        );

        console.error(error);

        // ==========================================
        // SAFELY RESPOND TO DISCORD
        // ==========================================

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
            '❌ Discord client error:'
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