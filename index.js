const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

process.env.FFMPEG_PATH = ffmpeg;

// --------------------------------------------------
// CONFIGURATION (Secure Environment Variable)
// --------------------------------------------------

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = "1316737145901285386";

// --------------------------------------------------
// WEB SERVER (Express for Fly.io health checks)
// --------------------------------------------------

const express = require('express');
const app = express();

const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('🎵 Cozy Music Bot is alive!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// --------------------------------------------------
// DISCORD CLIENT & INTENTS
// --------------------------------------------------

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
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// --------------------------------------------------
// MUSIC FOLDER & STATE
// --------------------------------------------------

const MUSIC_DIR = path.join(__dirname, 'music');
const music = new Map();

const commands = [
    new SlashCommandBuilder().setName('play').setDescription('Start the music'),
    new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
    new SlashCommandBuilder().setName('pause').setDescription('Pause the music'),
    new SlashCommandBuilder().setName('resume').setDescription('Resume the music'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop the music')
].map(command => command.toJSON());

function getMusicFiles() {
    if (!fs.existsSync(MUSIC_DIR)) {
        fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    return fs.readdirSync(MUSIC_DIR)
        .filter(file => ['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(path.extname(file).toLowerCase()))
        .sort()
        .map(file => path.join(MUSIC_DIR, file));
}

async function playNext(guildId) {
    const data = music.get(guildId);
    if (!data || data.stopped) return;

    if (data.queue.length === 0) {
        data.queue = getMusicFiles();
        if (data.queue.length === 0) return;
    }

    const filePath = data.queue.shift();
    data.currentTrack = path.basename(filePath);

    try {
        const resource = createAudioResource(filePath, { inlineVolume: true });
        resource.volume.setVolume(1.0);
        data.player.play(resource);
    } catch (error) {
        await playNext(guildId);
    }
}

async function createMusicPlayer(guildId, channel) {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
        addressType: 'ipv4'
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });

    connection.subscribe(player);

    const data = { connection, player, queue: [], currentTrack: null, stopped: false };
    music.set(guildId, data);

    player.on(AudioPlayerStatus.Idle, () => {
        playNext(guildId).catch(console.error);
    });

    return data;
}

client.once('clientReady', async () => {
    console.log('🤖 COZY MUSIC BOT ONLINE');
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
        console.log('✅ Slash commands registered.');
    } catch (error) {
        console.error('❌ Command registration error:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;

    const guildId = interaction.guild.id;

    if (interaction.commandName === 'play') {
        await interaction.deferReply();
        const channel = interaction.member?.voice?.channel;

        if (!channel) {
            return interaction.editReply({ content: '❌ Join a voice channel first!' });
        }

        try {
            let data = music.get(guildId);
            if (!data) data = await createMusicPlayer(guildId, channel);

            data.stopped = false;
            if (data.queue.length === 0) data.queue = getMusicFiles();
            if (data.queue.length === 0) return interaction.editReply('❌ No music files found.');

            if (data.player.state.status === AudioPlayerStatus.Idle) {
                await playNext(guildId);
            }

            await interaction.editReply(`🎶 Music started in **${channel.name}**! Loop active.`);
        } catch (error) {
            await interaction.editReply(`❌ Could not start music: ${error.message}`);
        }
    }

    if (interaction.commandName === 'skip') {
        const data = music.get(guildId);
        if (!data) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
        data.player.stop();
        await interaction.reply(`⏭️ Skipped **${data.currentTrack || 'song'}**.`);
    }

    if (interaction.commandName === 'pause') {
        const data = music.get(guildId);
        if (!data) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
        data.player.pause();
        await interaction.reply('⏸️ Paused.');
    }

    if (interaction.commandName === 'resume') {
        const data = music.get(guildId);
        if (!data) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
        data.player.unpause();
        await interaction.reply('▶️ Resumed.');
    }

    if (interaction.commandName === 'stop') {
        const data = music.get(guildId);
        if (!data) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
        data.stopped = true;
        data.player.stop();
        data.connection.destroy();
        music.delete(guildId);
        await interaction.reply('⏹️ Stopped and left channel.');
    }
});

console.log('🔑 Logging into Discord...');
client.login(DISCORD_TOKEN);