require('dotenv').config();

const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

process.env.FFMPEG_PATH = ffmpeg;

// --------------------------------------------------
// WEB SERVER FOR RENDER
// --------------------------------------------------

const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('🎵 Cozy Music Bot is alive!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
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

// --------------------------------------------------
// DISCORD CLIENT
// --------------------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// --------------------------------------------------
// ENVIRONMENT VARIABLES
// --------------------------------------------------

const GUILD_ID = process.env.GUILD_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// --------------------------------------------------
// MUSIC FOLDER
// --------------------------------------------------

const MUSIC_DIR = path.join(__dirname, 'music');

// --------------------------------------------------
// SLASH COMMANDS
// --------------------------------------------------

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Start the music'),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),

    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the music'),

    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the music'),

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
        console.log('⚠️ Music folder does not exist.');
        fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }

    const files = fs.readdirSync(MUSIC_DIR);

    console.log(`📂 Files found in music folder: ${files.length}`);

    return files
        .filter(file => {

            const ext = path.extname(file).toLowerCase();

            return [
                '.mp3',
                '.wav',
                '.ogg',
                '.flac',
                '.m4a'
            ].includes(ext);

        })
        .sort()
        .map(file => path.join(MUSIC_DIR, file));
}

// --------------------------------------------------
// PLAY NEXT SONG
// --------------------------------------------------

async function playNext(guildId) {

    const data = music.get(guildId);

    if (!data || data.stopped) {
        return;
    }

    // --------------------------------------------------
    // RELOAD PLAYLIST WHEN EMPTY
    // --------------------------------------------------

    if (data.queue.length === 0) {

        data.queue = getMusicFiles();

        if (data.queue.length === 0) {

            console.log(
                `[${guildId}] ❌ No music files found!`
            );

            return;
        }

        console.log(
            `[${guildId}] 🔄 Playlist looped. ${data.queue.length} tracks loaded.`
        );
    }

    // --------------------------------------------------
    // GET NEXT FILE
    // --------------------------------------------------

    const filePath = data.queue.shift();

    data.currentTrack = path.basename(filePath);

    console.log(
        `[${guildId}] 🎵 Playing: ${data.currentTrack}`
    );

    try {

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

        await playNext(guildId);
    }
}

// --------------------------------------------------
// CREATE MUSIC PLAYER
// --------------------------------------------------

async function createMusicPlayer(guildId, channel) {

    console.log(
        `[${guildId}] 🔊 Joining voice channel: ${channel.name}`
    );

    // --------------------------------------------------
    // JOIN DISCORD VOICE
    // --------------------------------------------------

    const connection = joinVoiceChannel({

        channelId: channel.id,

        guildId: guildId,

        adapterCreator: channel.guild.voiceAdapterCreator,

        selfDeaf: false,

        selfMute: false
    });

    console.log(
        `[${guildId}] 🔊 Connecting to Discord voice...`
    );

    // --------------------------------------------------
    // WAIT FOR VOICE CONNECTION
    // --------------------------------------------------

    try {

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            30_000
        );

        console.log(
            `[${guildId}] ✅ Discord voice connection READY!`
        );

    } catch (error) {

        console.error(
            `[${guildId}] ❌ Voice connection failed:`,
            error
        );

        connection.destroy();

        throw new Error(
            'Discord voice connection failed. Check Render voice networking / UDP.'
        );
    }

    // --------------------------------------------------
    // AUDIO PLAYER
    // --------------------------------------------------

    const player = createAudioPlayer({

        behaviors: {

            noSubscriber:
                NoSubscriberBehavior.Play
        }
    });

    // --------------------------------------------------
    // CONNECT PLAYER TO VOICE
    // --------------------------------------------------

    connection.subscribe(player);

    // --------------------------------------------------
    // SAVE MUSIC DATA
    // --------------------------------------------------

    const data = {

        connection,

        player,

        queue: [],

        currentTrack: null,

        stopped: false
    };

    music.set(guildId, data);

    // --------------------------------------------------
    // VOICE CONNECTION EVENTS
    // --------------------------------------------------

    connection.on(
        'stateChange',
        (oldState, newState) => {

            console.log(
                `[${guildId}] 🔊 Voice: ${oldState.status} -> ${newState.status}`
            );
        }
    );

    connection.on(
        'error',
        error => {

            console.error(
                `[${guildId}] ❌ Voice connection error:`,
                error
            );
        }
    );

    // --------------------------------------------------
    // AUDIO PLAYER EVENTS
    // --------------------------------------------------

    player.on(
        'stateChange',
        (oldState, newState) => {

            console.log(
                `[${guildId}] 🎧 Player: ${oldState.status} -> ${newState.status}`
            );
        }
    );

    player.on(
        AudioPlayerStatus.Playing,
        () => {

            console.log(
                `[${guildId}] ▶️ NOW PLAYING: ${data.currentTrack}`
            );
        }
    );

    player.on(
        AudioPlayerStatus.Idle,
        () => {

            console.log(
                `[${guildId}] ⏭️ Song finished. Starting next song...`
            );

            playNext(guildId)
                .catch(console.error);
        }
    );

    player.on(
        'error',
        error => {

            console.error(
                `[${guildId}] ❌ AUDIO PLAYER ERROR:`,
                error
            );

            playNext(guildId)
                .catch(console.error);
        }
    );

    return data;
}

// --------------------------------------------------
// BOT READY
// --------------------------------------------------

client.once(
    'clientReady',
    async () => {

        console.log('');
        console.log('======================================');
        console.log('🤖 COZY MUSIC BOT ONLINE');
        console.log('======================================');

        console.log(
            `🤖 Logged in as: ${client.user.tag}`
        );

        console.log(
            `📁 Music directory: ${MUSIC_DIR}`
        );

        console.log(
            `📂 Music directory exists: ${fs.existsSync(MUSIC_DIR)}`
        );

        // --------------------------------------------------
        // CHECK MUSIC FILES
        // --------------------------------------------------

        const files = getMusicFiles();

        console.log(
            `🎵 Found ${files.length} playable music files.`
        );

        if (files.length === 0) {

            console.log(
                '⚠️ WARNING: Render cannot see any playable music files.'
            );

        } else {

            console.log('🎵 Music files:');

            files.forEach(file => {

                console.log(
                    `   • ${path.basename(file)}`
                );
            });
        }

        // --------------------------------------------------
        // REGISTER COMMANDS
        // --------------------------------------------------

        const rest = new REST({
            version: '10'
        }).setToken(DISCORD_TOKEN);

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

            console.log(
                '✅ Slash commands registered.'
            );

        } catch (error) {

            console.error(
                '❌ Command registration error:',
                error
            );
        }

        console.log('======================================');
        console.log('🎵 BOT READY');
        console.log('======================================');
    }
);

// --------------------------------------------------
// COMMAND HANDLER
// --------------------------------------------------

client.on(
    'interactionCreate',
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        if (!interaction.guild) {
            return;
        }

        const guildId = interaction.guild.id;

        // ==================================================
        // /PLAY
        // ==================================================

        if (interaction.commandName === 'play') {

            const channel =
                interaction.member?.voice?.channel;

            if (!channel) {

                return interaction.reply({
                    content:
                        '❌ Join a voice channel first!',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {

                let data = music.get(guildId);

                // --------------------------------------------------
                // CREATE PLAYER
                // --------------------------------------------------

                if (!data) {

                    data = await createMusicPlayer(
                        guildId,
                        channel
                    );
                }

                data.stopped = false;

                // --------------------------------------------------
                // LOAD MUSIC
                // --------------------------------------------------

                if (data.queue.length === 0) {

                    data.queue = getMusicFiles();
                }

                if (data.queue.length === 0) {

                    return interaction.editReply(
                        '❌ I cannot find any music files in the `music` folder on Render.'
                    );
                }

                // --------------------------------------------------
                // START MUSIC
                // --------------------------------------------------

                if (
                    data.player.state.status ===
                    AudioPlayerStatus.Idle
                ) {

                    await playNext(guildId);
                }

                await interaction.editReply(
                    `🎶 Music started in **${channel.name}**!\n🔁 The playlist will loop automatically.`
                );

            } catch (error) {

                console.error(
                    `[${guildId}] ❌ PLAY ERROR:`,
                    error
                );

                await interaction.editReply(
                    `❌ Could not start music.\n\`${error.message}\``
                );
            }
        }

        // ==================================================
        // /SKIP
        // ==================================================

        if (interaction.commandName === 'skip') {

            const data = music.get(guildId);

            if (!data) {

                return interaction.reply({
                    content:
                        '❌ Nothing is playing.',
                    ephemeral: true
                });
            }

            const skipped =
                data.currentTrack || 'current song';

            data.player.stop();

            await interaction.reply(
                `⏭️ Skipped **${skipped}**.`
            );
        }

        // ==================================================
        // /PAUSE
        // ==================================================

        if (interaction.commandName === 'pause') {

            const data = music.get(guildId);

            if (!data) {

                return interaction.reply({
                    content:
                        '❌ Nothing is playing.',
                    ephemeral: true
                });
            }

            data.player.pause();

            await interaction.reply(
                '⏸️ Music paused.'
            );
        }

        // ==================================================
        // /RESUME
        // ==================================================

        if (interaction.commandName === 'resume') {

            const data = music.get(guildId);

            if (!data) {

                return interaction.reply({
                    content:
                        '❌ Nothing is playing.',
                    ephemeral: true
                });
            }

            data.player.unpause();

            await interaction.reply(
                '▶️ Music resumed.'
            );
        }

        // ==================================================
        // /STOP
        // ==================================================

        if (interaction.commandName === 'stop') {

            const data = music.get(guildId);

            if (!data) {

                return interaction.reply({
                    content:
                        '❌ Nothing is playing.',
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
    }
);

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

client.on(
    'error',
    error => {

        console.error(
            '❌ Discord client error:',
            error
        );
    }
);

// --------------------------------------------------
// CHECK ENVIRONMENT
// --------------------------------------------------

if (!DISCORD_TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN is missing!'
    );

    process.exit(1);
}

if (!GUILD_ID) {

    console.error(
        '❌ GUILD_ID is missing!'
    );

    process.exit(1);
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

console.log('🔑 Logging into Discord...');

client.login(DISCORD_TOKEN);