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
    entersState
} = require('@discordjs/voice');

// ==========================================
// CHECK DISCORD TOKEN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing!');
    console.error('Add DISCORD_TOKEN to your Render Environment Variables.');
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

        const voiceChannel = interaction.member?.voice?.channel;

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
            'music.mp3'
        );

        console.log(
            `🎧 Looking for music file: ${audioPath}`
        );

        // ==========================================
        // CHECK MUSIC FILE
        // ==========================================

        if (!fs.existsSync(audioPath)) {

            console.error(
                '❌ music.mp3 was not found!'
            );

            connection.destroy();

            await interaction.editReply(
                '❌ I cannot find music/music.mp3. Make sure the file is inside the music folder on GitHub.'
            );

            return;
        }

        console.log(
            '✅ music/music.mp3 found!'
        );

        // ==========================================
        // CREATE AUDIO PLAYER
        // ==========================================

        const player = createAudioPlayer();

        connection.subscribe(player);

        console.log(
            '🎵 Audio player created.'
        );

        // ==========================================
        // PLAY MUSIC
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

                player.play(resource);

            } catch (error) {

                console.error(
                    '❌ Error starting music:',
                    error
                );
            }
        };

        // ==========================================
        // LOOP MUSIC
        // ==========================================

        player.on('idle', () => {

            console.log(
                '🔁 Music finished. Restarting...'
            );

            playMusic();
        });

        // ==========================================
        // AUDIO ERRORS
        // ==========================================

        player.on('error', error => {

            console.error(
                '❌ Audio player error:',
                error
            );
        });

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
            '❌ Error running /play:',
            error
        );

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
                '❌ Could not send error reply:',
                replyError
            );
        }
    }
});

// ==========================================
// DISCORD CLIENT ERRORS
// ==========================================

client.on('error', error => {

    console.error(
        '❌ Discord client error:',
        error
    );
});

// ==========================================
// LOGIN
// ==========================================

console.log(
    '🔑 Logging into Discord...'
);

client.login(
    process.env.DISCORD_TOKEN
);