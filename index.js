require('dotenv').config();

const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

process.env.FFMPEG_PATH = ffmpeg;

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Cozy Music Bot is alive!');
});

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// --------------------------------------------------
// DISCORD
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
        GatewayIntentBits.GuildVoiceStates
    ]
});

const GUILD_ID = process.env.GUILD_ID;

// IMPORTANT:
// Music files go inside ./music
const MUSIC_DIR = path.join(__dirname, 'music');

// --------------------------------------------------
// COMMANDS
// --------------------------------------------------

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Start the music'),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music')
].map(command => command.toJSON());

// --------------------------------------------------
// MUSIC STATE
// --------------------------------------------------

const music = new Map();

// --------------------------------------------------
// GET MUSIC FILES
// --------------------------------------------------

function getMusicFiles() {
    if (!fs.existsSync(MUSIC_DIR)) {
        fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }

    return fs.readdirSync(MUSIC_DIR)
        .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext);
        })
        .sort()
        .map(file => path.join(MUSIC_DIR, file));
}

// --------------------------------------------------
// PLAY NEXT
// --------------------------------------------------

async function playNext(guildId) {
    const data = music.get(guildId);

    if (!data || data.stopped) {
        return;
    }

    // Reload playlist when empty
    if (data.queue.length === 0) {
        data.queue = getMusicFiles();

        if (data.queue.length === 0) {
            console.log(`[${guildId}] ❌ No music files found!`);
            return;
        }

        console.log(
            `[${guildId}] 🔄 Playlist looped. ${data.queue.length} tracks loaded.`
        );
    }

    const filePath = data.queue.shift();

    data.currentTrack = path.basename(filePath);

    console.log(
        `[${guildId}] 🎵 Playing: ${data.currentTrack}`
    );

    try {
        // Create audio resource from the local file.
        // Discord.js Voice will use FFmpeg for compressed formats.
        const resource = createAudioResource(filePath, {
            inlineVolume: true
        });

        resource.volume.setVolume(1.0);

        data.player.play(resource);

    } catch (error) {
        console.error(
            `[${guildId}] ❌ Could not play ${data.currentTrack}:`,
            error
        );

        // Try the next song
        await playNext(guildId);
    }
}

// --------------------------------------------------
// CREATE MUSIC PLAYER
// --------------------------------------------------

async function createMusicPlayer(guildId, channel) {

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    console.log(`[${guildId}] 🔊 Connecting to voice...`);

    // Wait for Discord voice connection
    try {
        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            30_000
        );

        console.log(`[${guildId}] ✅ Voice connection READY!`);

    } catch (error) {
        console.error(
            `[${guildId}] ❌ Voice connection failed:`,
            error
        );

        connection.destroy();
        throw new Error(
            'Discord voice connection failed. Check the Render voice/UDP connection.'
        );
    }

    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
        }
    });

    connection.subscribe(player);

    const data = {
        connection,
        player,
        queue: [],
        currentTrack: null,
        stopped: false
    };

    music.set(guildId, data);

    // --------------------------------------------------
    // VOICE CONNECTION LOGGING
    // --------------------------------------------------

    connection.on('stateChange', (oldState, newState) => {
        console.log(
            `[${guildId}] Voice: ${oldState.status} -> ${newState.status}`
        );
    });

    connection.on('error', error => {
        console.error(
            `[${guildId}] ❌ Voice connection error:`,
            error
        );
    });

    // --------------------------------------------------
    // PLAYER LOGGING
    // --------------------------------------------------

    player.on('stateChange', (oldState, newState) => {
        console.log(
            `[${guildId}] Player: ${oldState.status} -> ${newState.status}`
        );
    });

    player.on(AudioPlayerStatus.Playing, () => {
        console.log(
            `[${guildId}] ▶️ NOW PLAYING: ${data.currentTrack}`
        );
    });

    player.on(AudioPlayerStatus.Idle, () => {
        console.log(
            `[${guildId}] ⏭️ Track finished. Starting next track...`
        );

        playNext(guildId).catch(console.error);
    });

    player.on('error', error => {
        console.error(
            `[${guildId}] ❌ AUDIO PLAYER ERROR:`,
            error
        );

        playNext(guildId).catch(console.error);
    });

    return data;
}

// --------------------------------------------------
// READY
// --------------------------------------------------

client.once('clientReady', async () => {

    console.log(`🤖 Logged in as ${client.user.tag}`);

    console.log(`📁 Music directory: ${MUSIC_DIR}`);

    const files = getMusicFiles();

    console.log(`🎵 Found ${files.length} music files.`);

    files.forEach(file => {
        console.log(`   • ${path.basename(file)}`);
    });

    const rest = new REST({
        version: '10'
    }).setToken(process.env.DISCORD_TOKEN);

    try {

        await rest.put(
            Routes.applicationGuildCommands(
                client.user.id,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log('✅ Slash commands registered.');

    } catch (error) {

        console.error(
            '❌ Command registration error:',
            error
        );

    }
});

// --------------------------------------------------
// COMMAND HANDLER
// --------------------------------------------------

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    const guildId = interaction.guild.id;

    // --------------------------------------------------
    // PLAY
    // --------------------------------------------------

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

            let data = music.get(guildId);

            // Create player if one doesn't exist
            if (!data) {

                data = await createMusicPlayer(
                    guildId,
                    channel
                );

            }

            data.stopped = false;

            // Load music if queue is empty
            if (data.queue.length === 0) {

                data.queue = getMusicFiles();

            }

            if (data.queue.length === 0) {

                return interaction.editReply(
                    '❌ No music files found in the `music` folder.'
                );

            }

            // Only start if currently idle
            if (
                data.player.state.status ===
                AudioPlayerStatus.Idle
            ) {

                await playNext(guildId);

            }

            await interaction.editReply(
                `🎶 Playing **${data.queue.length}** queued track(s) in **${channel.name}**.`
            );

        } catch (error) {

            console.error(
                `[${guildId}] PLAY ERROR:`,
                error
            );

            await interaction.editReply(
                `❌ Could not start music.\n\`${error.message}\``
            );

        }
    }

    // --------------------------------------------------
    // SKIP
    // --------------------------------------------------

    if (interaction.commandName === 'skip') {

        const data = music.get(guildId);

        if (!data) {

            return interaction.reply({
                content: '❌ Nothing is playing.',
                ephemeral: true
            });

        }

        const skipped = data.currentTrack;

        data.player.stop();

        await interaction.reply(
            `⏭️ Skipped **${skipped || 'current track'}**.`
        );

    }

    // --------------------------------------------------
    // STOP
    // --------------------------------------------------

    if (interaction.commandName === 'stop') {

        const data = music.get(guildId);

        if (!data) {

            return interaction.reply({
                content: '❌ Nothing is playing.',
                ephemeral: true
            });

        }

        data.stopped = true;

        data.player.stop();

        data.connection.destroy();

        music.delete(guildId);

        await interaction.reply(
            '⏹️ Music stopped and I left the voice channel.'
        );

    }

});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

if (!process.env.DISCORD_TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN is missing!'
    );

    process.exit(1);

}

client.login(process.env.DISCORD_TOKEN);