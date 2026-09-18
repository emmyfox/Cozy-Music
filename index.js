const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, StreamType } = require('@discordjs/voice');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Force IPv4 for UDP voice connections on cloud platforms like Render
process.env.IPV4_ONLY = 'true';

const app = express();
const PORT = process.env.PORT || 10000;

// Express health check server for Render 24/7 uptime
app.get('/', (req, res) => {
    res.send('Cozy Music Bot is alive and streaming!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

client.once('ready', async () => {
    console.log(`🤖 COZY MUSIC BOT ONLINE`);

    // Register slash commands
    const commands = [
        {
            name: 'play',
            description: 'Start streaming cozy music in your voice channel',
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ Slash commands registered.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        const member = interaction.member;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel first!', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            // Handle connection failures and cleanup
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    connection.destroy();
                }
            });

            // Point to your audio file or stream source
            const audioPath = path.join(__dirname, 'music.mp3'); // Make sure your audio file is in the project directory
            
            if (fs.existsSync(audioPath)) {
                const player = createAudioPlayer();
                const resource = createAudioResource(audioPath, { inputType: StreamType.Arbitrary });
                
                connection.subscribe(player);
                player.play(resource);

                // Loop audio continuously
                player.on('idle', () => {
                    try {
                        const loopingResource = createAudioResource(audioPath, { inputType: StreamType.Arbitrary });
                        player.play(loopingResource);
                    } catch (err) {
                        console.error('Error looping audio:', err);
                    }
                });
            }

            await interaction.editReply('🎶 Cozy music stream started successfully!');
        } catch (error) {
            console.error('Voice connection error:', error);
            await interaction.editReply('❌ Could not start music: The operation was aborted');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);