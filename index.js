require('dotenv').config({ override: true });

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
    VoiceConnectionStatus,
    AudioPlayerStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

const express = require('express');
const fs = require('fs');
const path = require('path');


// ========================================
// CONFIG
// ========================================

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const MUSIC_FOLDER = path.join(__dirname, 'music');


// ========================================
// BASIC CHECKS
// ========================================

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing from .env');
    process.exit(1);
}

if (!GUILD_ID) {
    console.error('❌ GUILD_ID is missing from .env');
    process.exit(1);
}


// ========================================
// WEB SERVER
// ========================================

const app = express();

app.get('/', (req, res) => {
    res.send('🎵 Cozy Music Bot is online!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});


// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});


// ========================================
// MUSIC FILES
// ========================================

function getMusicFiles() {
    if (!fs.existsSync(MUSIC_FOLDER)) {
        console.error(`❌ Music folder not found: ${MUSIC_FOLDER}`);
        return [];
    }

    return fs.readdirSync(MUSIC_FOLDER)
        .filter(file => file.toLowerCase().endsWith('.mp3'))
        .map(file => path.join(MUSIC_FOLDER, file));
}

function getRandomMusicFile() {
    const files = getMusicFiles();

    if (files.length === 0) {
        return null;
    }

    return files[Math.floor(Math.random() * files.length)];
}


// ========================================
// VOICE STATE
// ========================================

let connection = null;
let player = null;
let currentAudioFile = null;
let reconnecting = false;


// ========================================
// START MUSIC
// ========================================

async function startMusic(guild) {
    try {
        const voiceChannel = guild.members.me?.voice?.channel;

        if (!voiceChannel) {
            console.log('❌ Bot is not currently in a voice channel.');
            return;
        }

        const audioFile = getRandomMusicFile();

        if (!audioFile) {
            console.error('❌ No MP3 files found in music folder.');
            return;
        }

        currentAudioFile = audioFile;

        console.log(`🎵 Playing: ${path.basename(audioFile)}`);

        if (!player) {
            player = createAudioPlayer();

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('🔄 Song finished. Choosing another song...');

                setTimeout(() => {
                    if (connection) {
                        startMusic(guild);
                    }
                }, 1000);
            });

            player.on('error', error => {
                console.error('❌ Audio player error:', error.message);

                setTimeout(() => {
                    if (connection) {
                        startMusic(guild);
                    }
                }, 2000);
            });
        }

        const resource = createAudioResource(audioFile, {
            inputType: StreamType.Arbitrary
        });

        connection.subscribe(player);
        player.play(resource);

    } catch (error) {
        console.error('❌ Music error:', error);
    }
}


// ========================================
// CONNECT TO VOICE
// ========================================

async function connectToVoice(guild) {
    try {
        const voiceChannel = guild.members.me?.voice?.channel;

        if (!voiceChannel) {
            console.log('❌ Bot is not in a voice channel.');
            return;
        }

        console.log(`🔊 Connecting to: ${voiceChannel.name}`);

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('✅ Voice connection ready!');

            startMusic(guild);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log('⚠️ Voice connection disconnected.');

            if (reconnecting) return;

            reconnecting = true;

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
            } catch {
                try {
                    connection.destroy();
                } catch {}

                connection = null;

                console.log('🔄 Reconnecting to voice...');

                setTimeout(() => {
                    reconnecting = false;
                    connectToVoice(guild);
                }, 3000);
            }

            reconnecting = false;
        });

    } catch (error) {
        console.error('❌ Voice connection error:', error);
    }
}


// ========================================
// SLASH COMMAND
// ========================================

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Start cozy music')
].map(command => command.toJSON());


// ========================================
// REGISTER COMMAND
// ========================================

async function registerCommands() {
    try {
        console.log('📝 Registering slash commands...');

        const rest = new REST({ version: '10' }).setToken(TOKEN);

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
        console.error('❌ Command registration error:', error);
    }
}


// ========================================
// BOT READY
// ========================================

client.once('ready', async () => {
    console.log('');
    console.log('========================================');
    console.log('🎵 COZY MUSIC');
    console.log('========================================');
    console.log(`🤖 Logged in as: ${client.user.tag}`);
    console.log(`🏠 Guild ID: ${GUILD_ID}`);
    console.log('========================================');
    console.log('');

    await registerCommands();
});


// ========================================
// SLASH COMMAND HANDLER
// ========================================

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        await interaction.deferReply();

        try {
            const guild = interaction.guild;

            if (!guild) {
                await interaction.editReply(
                    '❌ This command can only be used in a server.'
                );
                return;
            }

            const memberChannel = interaction.member?.voice?.channel;

            if (!memberChannel) {
                await interaction.editReply(
                    '❌ You need to be in a voice channel first!'
                );
                return;
            }

            if (
                connection &&
                guild.members.me?.voice?.channelId === memberChannel.id
            ) {
                await interaction.editReply(
                    '🎵 Cozy music is already playing!'
                );
                return;
            }

            if (connection) {
                try {
                    connection.destroy();
                } catch {}

                connection = null;
            }

            connection = joinVoiceChannel({
                channelId: memberChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: false
            });

            connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('✅ Voice connection ready!');
                startMusic(guild);
            });

            await interaction.editReply(
                '🎵 Cozy music is starting!'
            );

        } catch (error) {
            console.error('❌ Play command error:', error);

            await interaction.editReply(
                '❌ Something went wrong starting the music.'
            );
        }
    }
});


// ========================================
// LOGIN
// ========================================

console.log('🔑 Logging into Discord...');
console.log('🔐 Token loaded:', !!TOKEN);
console.log('📏 Token length:', TOKEN.length);

client.login(TOKEN)
    .then(() => {
        console.log('✅ Login request accepted by Discord.');
    })
    .catch(error => {
        console.error('❌ LOGIN FAILED:', error.message);
    });