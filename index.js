require("dotenv").config();

const express = require("express");
const dns = require("dns");
const dgram = require("dgram");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");

const path = require("path");
const fs = require("fs");

// ============================================================
// BASIC SETTINGS
// ============================================================

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

// ============================================================
// EXPRESS WEB SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.send("🎵 Cozy Music Bot is online!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: "Cozy Music",
    time: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ============================================================
// DISCORD SLASH COMMAND
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play the Cozy Music playlist")
].map(command => command.toJSON());

// ============================================================
// REGISTER SLASH COMMAND
// ============================================================

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("✅ Slash command registered.");
  } catch (error) {
    console.error("❌ Failed to register slash command:");
    console.error(error);
  }
}

// ============================================================
// UDP DIAGNOSTIC
// ============================================================

async function runUDPDiagnostic() {
  console.log("");
  console.log("========================================");
  console.log("🧪 UDP CONNECTIVITY TEST");
  console.log("========================================");

  // ----------------------------------------------------------
  // TEST 1 - DNS
  // ----------------------------------------------------------

  console.log("🔎 Test 1: DNS resolution");

  try {
    const addresses = await dns.promises.resolve4("discord.com");

    console.log("✅ DNS works.");
    console.log("🌐 discord.com IPv4 addresses:");

    for (const address of addresses) {
      console.log(`   ${address}`);
    }
  } catch (error) {
    console.error("❌ DNS TEST FAILED");
    console.error("Error:", error.message);
  }

  // ----------------------------------------------------------
  // TEST 2 - CREATE UDP SOCKET
  // ----------------------------------------------------------

  console.log("");
  console.log("🔎 Test 2: Creating UDP socket");

  const socket = dgram.createSocket("udp4");

  socket.on("error", error => {
    console.error("❌ UDP SOCKET ERROR");
    console.error("Error:", error.message);

    try {
      socket.close();
    } catch {}
  });

  try {
    await new Promise((resolve, reject) => {
      socket.bind(0, "0.0.0.0", () => {
        const address = socket.address();

        console.log("✅ UDP socket successfully created.");
        console.log(`📡 Local UDP address: ${address.address}`);
        console.log(`🔢 Local UDP port: ${address.port}`);

        resolve();
      });

      socket.once("error", reject);
    });
  } catch (error) {
    console.error("❌ UDP SOCKET CREATION FAILED");
    console.error("Error:", error.message);

    try {
      socket.close();
    } catch {}

    return;
  }

  // ----------------------------------------------------------
  // TEST 3 - SEND UDP PACKET
  // ----------------------------------------------------------

  console.log("");
  console.log("🔎 Test 3: Sending UDP packet");

  try {
    const testMessage = Buffer.from("Cozy Music UDP Test");

    await new Promise((resolve, reject) => {
      socket.send(
        testMessage,
        443,
        "discord.com",
        error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    });

    console.log("✅ UDP packet was successfully handed to Node.");
    console.log("📡 Destination: discord.com:443");
    console.log("ℹ️ This confirms Node can create/send UDP traffic.");
    console.log("ℹ️ It does NOT mean Discord Voice UDP is fully established.");
  } catch (error) {
    console.error("❌ UDP SEND FAILED");
    console.error("Error:", error.message);
  }

  // ----------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------

  try {
    socket.close();
    console.log("🧹 UDP diagnostic socket closed.");
  } catch {}

  console.log("========================================");
  console.log("🧪 UDP CONNECTIVITY TEST COMPLETE");
  console.log("========================================");
  console.log("");
}

// ============================================================
// DISCORD READY
// ============================================================

client.once("ready", async () => {
  console.log("🤖 COZY MUSIC BOT ONLINE");
  console.log(`👤 Logged in as ${client.user.tag}`);

  await registerCommands();

  // Run UDP test once when the bot starts.
  await runUDPDiagnostic();
});

// ============================================================
// /PLAY COMMAND
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== "play") {
    return;
  }

  console.log(`🎵 /play used by ${interaction.user.tag}`);

  // ----------------------------------------------------------
  // CHECK VOICE CHANNEL
  // ----------------------------------------------------------

  const member = interaction.member;

  if (!member || !member.voice || !member.voice.channel) {
    await interaction.reply({
      content: "❌ You need to join a voice channel first!"
    });

    return;
  }

  const voiceChannel = member.voice.channel;

  console.log(`🔊 Joining voice channel: ${voiceChannel.name}`);
  console.log(`🆔 Voice Channel ID: ${voiceChannel.id}`);
  console.log(`🆔 Guild ID: ${voiceChannel.guild.id}`);

  // ----------------------------------------------------------
  // JOIN VOICE
  // ----------------------------------------------------------

  let connection;

  try {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,

      selfDeaf: true,
      selfMute: false,

      debug: true
    });

    console.log("🔊 Voice connection created.");
    console.log(`📡 Initial voice state: ${connection.state.status}`);

    // --------------------------------------------------------
    // VOICE CONNECTION STATE LOGGING
    // --------------------------------------------------------

    connection.on("stateChange", (oldState, newState) => {
      console.log(
        `📡 Voice state: ${oldState.status} -> ${newState.status}`
      );

      if (newState.networking) {
        console.log(
          `🌐 Networking state: ${newState.networking.state.code}`
        );
      }
    });

    // --------------------------------------------------------
    // VOICE DEBUG
    // --------------------------------------------------------

    connection.on("debug", message => {
      // Don't print Discord voice tokens/session credentials.
      const safeMessage = String(message)
        .replace(/"token":"[^"]+"/g, '"token":"[REDACTED]"')
        .replace(/"session_id":"[^"]+"/g, '"session_id":"[REDACTED]"')
        .replace(/"sessionId":"[^"]+"/g, '"sessionId":"[REDACTED]"');

      console.log(`🌐 VOICE DEBUG: ${safeMessage}`);
    });

    // --------------------------------------------------------
    // CONNECTION ERROR
    // --------------------------------------------------------

    connection.on("error", error => {
      console.error("❌ VOICE CONNECTION ERROR");
      console.error(error);
    });

    // --------------------------------------------------------
    // NETWORKING EVENTS
    // --------------------------------------------------------

    if (connection.state.networking) {
      connection.state.networking.on("debug", message => {
        console.log(`🌐 NETWORK DEBUG: ${message}`);
      });

      connection.state.networking.on("error", error => {
        console.error("❌ NETWORKING ERROR");
        console.error(error);
      });
    }

    await interaction.reply(
      "🔊 Joining your voice channel... Testing Discord voice networking."
    );

    // --------------------------------------------------------
    // WAIT FOR READY
    // --------------------------------------------------------

    console.log("⏳ Waiting for Discord voice connection...");

    try {
      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        30000
      );

      console.log("");
      console.log("========================================");
      console.log("🎉🎉🎉 VOICE CONNECTION READY 🎉🎉🎉");
      console.log("========================================");
      console.log("");

    } catch (error) {
      console.error("");
      console.error("========================================");
      console.error("❌❌❌ VOICE CONNECTION FAILED ❌❌❌");
      console.error("========================================");

      console.error(
        `Current voice state: ${connection.state.status}`
      );

      if (connection.state.networking) {
        console.error(
          `Current networking state: ${connection.state.networking.state.code}`
        );

        console.error(
          "Networking state names:"
        );

        console.error(
          "0 = Opening WebSocket"
        );

        console.error(
          "1 = Identifying"
        );

        console.error(
          "2 = UDP Handshaking"
        );

        console.error(
          "3 = Selecting Protocol"
        );

        console.error(
          "4 = Ready"
        );

        console.error(
          "5 = Resuming"
        );

        console.error(
          "6 = Closed"
        );
      }

      console.error("Voice connection error:", error);

      await interaction.editReply(
        "❌ Discord could not establish the voice connection. Check the Render logs for the UDP test results."
      );

      return;
    }

    // --------------------------------------------------------
    // FIND MUSIC FILE
    // --------------------------------------------------------

    const musicFile = path.join(
      __dirname,
      "music",
      "starlight.mp3.mp3"
    );

    console.log(`🎵 Looking for music file: ${musicFile}`);

    if (!fs.existsSync(musicFile)) {
      console.error("❌ MUSIC FILE NOT FOUND!");

      await interaction.editReply(
        "❌ I connected to voice, but I could not find the music file."
      );

      return;
    }

    console.log("✅ Music file found.");

    // --------------------------------------------------------
    // CREATE AUDIO PLAYER
    // --------------------------------------------------------

    const player = createAudioPlayer();

    player.on("stateChange", (oldState, newState) => {
      console.log(
        `🎵 Player state: ${oldState.status} -> ${newState.status}`
      );
    });

    player.on("error", error => {
      console.error("❌ AUDIO PLAYER ERROR");
      console.error(error);
    });

    // --------------------------------------------------------
    // CREATE AUDIO RESOURCE
    // --------------------------------------------------------

    console.log("🎵 Creating audio resource...");

    const resource = createAudioResource(
      musicFile,
      {
        inlineVolume: true
      }
    );

    // --------------------------------------------------------
    // VOLUME
    // --------------------------------------------------------

    resource.volume.setVolume(0.5);

    // --------------------------------------------------------
    // SUBSCRIBE PLAYER
    // --------------------------------------------------------

    console.log("🔗 Subscribing audio player to voice connection...");

    connection.subscribe(player);

    // --------------------------------------------------------
    // PLAY MUSIC
    // --------------------------------------------------------

    console.log("▶️ Starting music...");

    player.play(resource);

    // --------------------------------------------------------
    // LOOP MUSIC
    // --------------------------------------------------------

    player.on(AudioPlayerStatus.Idle, () => {
      console.log("🔁 Song finished. Restarting...");

      try {
        const newResource = createAudioResource(
          musicFile,
          {
            inlineVolume: true
          }
        );

        newResource.volume.setVolume(0.5);

        player.play(newResource);
      } catch (error) {
        console.error("❌ Error restarting music:");
        console.error(error);
      }
    });

    console.log("🎶 Music playback started.");

    await interaction.editReply(
      "🎶 Cozy Music is now playing!"
    );

  } catch (error) {
    console.error("❌ ERROR WHILE JOINING VOICE");
    console.error(error);

    try {
      await interaction.editReply(
        "❌ Something went wrong while connecting to the voice channel."
      );
    } catch {}
  }
});

// ============================================================
// DISCORD LOGIN
// ============================================================

console.log("🔑 Logging into Discord...");

client.login(DISCORD_TOKEN).catch(error => {
  console.error("❌ Discord login failed!");
  console.error(error);
});