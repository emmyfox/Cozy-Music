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

const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// SETTINGS
// ==========================================

// Force IPv4 for cloud platforms like Render
process.env.IPV4_ONLY = 'true';

// Render provides PORT automatically
const PORT = process.env.PORT || 10000;

// ==========================================
// WEB SERVER
// ==========================================

const app = express();

app.get('/', (req, res) => {
    res.send('Cozy Music Bot is alive and streaming! 🎶');
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
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// ==========================================
// BOT READY
// ==========================================

client.once('ready', async () => {
    console.log(`🤖 COZY MUSIC BOT ONLINE`);
    console.log(`👤 Logged in as ${client.user.tag}`);

    // Slash commands
    const commands = [
        {
            name: 'play',
            description: 'Start streaming cozy music in your voice channel'
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

        console.log('✅ Slash commands registered.');
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
});

// ==========================================
// SLASH COMMANDS
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

    console.log(`🎵 /play used by ${interaction.user.tag}`);

    try {

        // ==========================================
        // ACKNOWLEDGE DISCORD IMMEDIATELY
        // ==========================================

        await interaction.deferReply();

        // ==========================================
        // CHECK VOICE CHANNEL
        // ==========================================

        const member = interaction.member;

        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {

            await interaction.editReply(
                '❌ You need to be in a voice channel first!'
            );

            return;
        }

        console.log(`🔊 Joining voice channel: ${voiceChannel.name}`);

        // ==========================================
        // JOIN VOICE CHANNEL
        // ==========================================

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        console.log('🔊 Voice connection created.');

        // ==========================================
        // HANDLE DISCONNECTS
        // ==========================================

        connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {

                console.log('⚠️ Voice connection disconnected.');

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

                    console.log('🔄 Voice connection recovering...');

                } catch (error) {

                    console.log(
                        '❌ Voice connection could not recover.'
                    );

                    connection.destroy();
                }
            }
        );

        // ==========================================
        // MUSIC FILE
        // ==========================================

        const audioPath = path.join(
            __dirname,
            'music.mp3'
        );

        console.log(`🎧 Looking for music file: ${audioPath}`);

        // Check that music.mp3 exists
        if (!fs.existsSync(audioPath)) {

            console.error(
                '❌ music.mp3 was not found!'
            );

            connection.destroy();

            await interaction.editReply(
                '❌ I cannot find `music.mp3`. Make sure it is in the same folder as `index.js`.'
            );

            return;
        }

        console.log('✅ music.mp3 found.');

        // ==========================================
        // CREATE AUDIO PLAYER
        // ==========================================

        const player = createAudioPlayer();

        // Connect player to Discord voice connection
        connection.subscribe(player);

        console.log('🎵 Audio player created.');

        // ==========================================
        // PLAY MUSIC FUNCTION
        // ==========================================

        const playMusic = () => {

            try {

                console.log('▶️ Starting music...');

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

        console.log(
            `✅ Music started in ${voiceChannel.name}`
        );

    } catch (error) {

        console.error(
            '❌ /play error:',
            error
        );

        // ==========================================
        // SAFE ERROR RESPONSE
        // ==========================================

        try {

            if (interaction.deferred || interaction.replied) {

                await interaction.editReply(
                    '❌ Something went wrong starting the music.'
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

if (!process.env.DISCORD_TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN is missing from Render Environment Variables!'
    );

    process.exit(1);
}

console.log('🔑 Logging into Discord...');

client.login(process.env.DISCORD_TOKEN);