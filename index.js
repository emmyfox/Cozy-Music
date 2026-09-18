require('dotenv').config();

// --------------------------------------------------
// TINY WEB SERVER FOR RENDER FREE TIER
// --------------------------------------------------
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Cozy Music Bot is alive and streaming!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});
// --------------------------------------------------

const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior
} = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const GUILD_ID = process.env.GUILD_ID;
const MUSIC_DIR = path.join(__dirname, 'music');

// Ensure the local music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR);
}

// --------------------------------------------------
// COMMANDS
// --------------------------------------------------

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Start playing your local AI music folder on a 24/7 loop'),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip to the next local track'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and leave the voice channel')
].map(command => command.toJSON());

// --------------------------------------------------
// MUSIC STATE
// --------------------------------------------------

const music = new Map();

// --------------------------------------------------
// PLAY NEXT LOCAL TRACK
// --------------------------------------------------

async function playNext(guildId) {
    const musicData = music.get(guildId);

    if (!musicData || musicData.stopped) {
        return;
    }

    if (musicData.queue.length === 0) {
        const files = fs.readdirSync(MUSIC_DIR).filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
        
        if (files.length === 0) {
            console.log(`[${guildId}] No audio files found in the 'music' folder!`);
            return;
        }

        musicData.queue = files.map(file => path.join(MUSIC_DIR, file));
        console.log(`[${guildId}] Playlist looped. Reloaded ${musicData.queue.length} tracks.`);
    }

    const filePath = musicData.queue.shift();
    musicData.currentTrack = path.basename(filePath);

    try {
        console.log(`[${guildId}] Now Playing: ${musicData.currentTrack}`);

        const resource = createAudioResource(filePath);
        musicData.player.play(resource);

    } catch (error) {
        console.error(`[${guildId}] Error playing ${musicData.currentTrack}:`, error.message);
        await playNext(guildId);
    }
}

// --------------------------------------------------
// DISCORD READY
// --------------------------------------------------

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );
        console.log('Slash commands registered.');
    } catch (error) {
        console.error('Command registration error:', error);
    }
});

// --------------------------------------------------
// COMMAND HANDLER
// --------------------------------------------------

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const guildId = interaction.guild.id;

    if (interaction.commandName === 'play') {
        const channel = interaction.member?.voice?.channel;

        if (!channel) {
            return interaction.reply({
                content: '❌ Join a voice channel first!',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            let musicData = music.get(guildId);

            if (!musicData) {
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator
                });

                const player = createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Play
                    }
                });

                connection.subscribe(player);

                musicData = {
                    connection,
                    player,
                    queue: [],
                    currentTrack: null,
                    stopped: false
                };

                music.set(guildId, musicData);

                player.on(AudioPlayerStatus.Idle, () => {
                    playNext(guildId).catch(console.error);
                });

                player.on('error', error => {
                    console.error(`[${guildId}] Audio error:`, error.message);
                    playNext(guildId).catch(console.error);
                });
            }

            musicData.stopped = false;

            if (musicData.player.state.status === AudioPlayerStatus.Idle || musicData.queue.length === 0) {
                const files = fs.readdirSync(MUSIC_DIR).filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
                if (files.length === 0) {
                    return interaction.editReply(`❌ No \`.mp3\` or \`.wav\` files found in your **music** folder!`);
                }
                musicData.queue = files.map(file => path.join(MUSIC_DIR, file));
                await playNext(guildId);
            }

            await interaction.editReply(
                `🎶 Connected to **${channel.name}**! Streaming your local AI music library on a loop.`
            );

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    }

    if (interaction.commandName === 'skip') {
        const musicData = music.get(guildId);

        if (!musicData) {
            return interaction.reply({ content: '❌ Nothing is currently playing.', ephemeral: true });
        }

        const skipped = musicData.currentTrack;
        musicData.player.stop();

        await interaction.reply(`⏭️ Skipped **${skipped || 'current track'}**.`);
    }

    if (interaction.commandName === 'stop') {
        const musicData = music.get(guildId);

        if (!musicData) {
            return interaction.reply({ content: '❌ Nothing is currently playing.', ephemeral: true });
        }

        musicData.stopped = true;
        musicData.player.stop();
        musicData.connection.destroy();
        music.delete(guildId);

        await interaction.reply('⏹️ Stopped playback and left the voice channel.');
    }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing from your .env file.');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);