require("dotenv").config();

const express = require("express");
const dns = require("dns");
const dgram = require("dgram");
const path = require("path");
const fs = require("fs");

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

// ============================================================
// SETTINGS
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
// SLASH COMMAND
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
// BASIC UDP TEST
// ============================================================

async function runBasicUDPDiagnostic() {
  console.log("");
  console.log("========================================");
  console.log("🧪 BASIC UDP CONNECTIVITY TEST");
  console.log("========================================");

  console.log("🔎 Test 1: DNS resolution");

  try {
    const addresses = await dns.promises.resolve4("discord.com");

    console.log("✅ DNS works.");

    for (const address of addresses) {
      console.log(`   ${address}`);
    }
  } catch (error) {
    console.error("❌ DNS TEST FAILED");
    console.error(error.message);
  }

  console.log("");
  console.log("🔎 Test 2: Creating UDP socket");

  const socket = dgram.createSocket("udp4");

  try {
    await new Promise((resolve, reject) => {
      socket.bind(0, "0.0.0.0", () => {
        const address = socket.address();

        console.log("✅ UDP socket successfully created.");
        console.log(`📡 Local address: ${address.address}`);
        console.log(`🔢 Local port: ${address.port}`);

        resolve();
      });

      socket.once("error", reject);
    });
  } catch (error) {
    console.error("❌ UDP SOCKET CREATION FAILED");
    console.error(error.message);

    try {
      socket.close();
    } catch {}

    return;
  }

  console.log("");
  console.log("🔎 Test 3: Sending generic UDP packet");

  try {
    const message = Buffer.from("Cozy Music UDP Test");

    await new Promise((resolve, reject) => {
      socket.send(
        message,
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

    console.log("✅ Generic UDP packet sent successfully.");
  } catch (error) {
    console.error("❌ UDP SEND FAILED");
    console.error(error.message);
  }

  try {
    socket.close();
  } catch {}

  console.log("========================================");
  console.log("🧪 BASIC UDP TEST COMPLETE");
  console.log("========================================");
  console.log("");
}

// ============================================================
// DISCORD VOICE UDP DISCOVERY TEST
// ============================================================
//
// Discord Voice IP Discovery uses a 74-byte packet:
//
// Bytes 0-1   = packet type (1)
// Bytes 2-3   = length (70)
// Bytes 4-7   = SSRC
// Bytes 8-71  = address area
// Bytes 72-73 = port
//
// We send this to the ACTUAL Discord Voice UDP server.
// ============================================================

async function runDiscordVoiceUDPDiscovery(
  voiceEndpoint,
  voicePort,
  ssrc
) {
  console.log("");
  console.log("========================================");
  console.log("🎯 DISCORD VOICE UDP DISCOVERY TEST");
  console.log("========================================");

  console.log(`🌐 Voice endpoint: ${voiceEndpoint}`);
  console.log(`🔢 Voice UDP port: ${voicePort}`);
  console.log(`🆔 SSRC: ${ssrc}`);

  console.log("");
  console.log("🔎 Resolving Discord Voice endpoint...");

  let addresses;

  try {
    addresses = await dns.promises.resolve4(voiceEndpoint);

    console.log("✅ Voice endpoint resolved.");

    for (const address of addresses) {
      console.log(`   ${address}`);
    }
  } catch (error) {
    console.error("❌ Could not resolve Discord Voice endpoint.");
    console.error(error.message);

    return {
      success: false,
      reason: "DNS resolution failed"
    };
  }

  const targetIP = addresses[0];

  console.log("");
  console.log(`🎯 Testing Discord Voice UDP server: ${targetIP}:${voicePort}`);

  const socket = dgram.createSocket("udp4");

  let finished = false;

  const cleanup = () => {
    try {
      socket.close();
    } catch {}
  };

  return new Promise(resolve => {
    // --------------------------------------------------------
    // SOCKET ERROR
    // --------------------------------------------------------

    socket.on("error", error => {
      if (finished) {
        return;
      }

      finished = true;

      console.error("");
      console.error("❌ DISCORD VOICE UDP SOCKET ERROR");
      console.error(`Error: ${error.message}`);

      cleanup();

      resolve({
        success: false,
        reason: error.message
      });
    });

    // --------------------------------------------------------
    // RECEIVE UDP RESPONSE
    // --------------------------------------------------------

    socket.on("message", (message, remote) => {
      if (finished) {
        return;
      }

      finished = true;

      console.log("");
      console.log("🎉🎉🎉 DISCORD VOICE UDP RESPONSE RECEIVED! 🎉🎉🎉");

      console.log(`📡 Response came from: ${remote.address}:${remote.port}`);
      console.log(`📦 Response size: ${message.length} bytes`);

      // ------------------------------------------------------
      // Validate response
      // ------------------------------------------------------

      if (message.length < 74) {
        console.log(
          "⚠️ A UDP response arrived, but it was smaller than the expected 74 bytes."
        );
      } else {
        console.log("✅ Response is at least 74 bytes.");
      }

      // ------------------------------------------------------
      // Extract discovered IP
      // ------------------------------------------------------

      let discoveredIP = "";

      if (message.length >= 72) {
        const addressBuffer = message.subarray(8, 72);

        const nullIndex = addressBuffer.indexOf(0);

        const usableBuffer =
          nullIndex === -1
            ? addressBuffer
            : addressBuffer.subarray(0, nullIndex);

        discoveredIP = usableBuffer.toString("utf8");
      }

      // ------------------------------------------------------
      // Extract discovered port
      // ------------------------------------------------------

      let discoveredPort = null;

      if (message.length >= 74) {
        discoveredPort = message.readUInt16BE(72);
      }

      console.log(`🌍 Discovered external IP: ${discoveredIP || "unknown"}`);
      console.log(
        `🔢 Discovered external UDP port: ${
          discoveredPort ?? "unknown"
        }`
      );

      console.log("");
      console.log("✅✅✅ ACTUAL DISCORD VOICE UDP WORKS! ✅✅✅");

      cleanup();

      resolve({
        success: true,
        discoveredIP,
        discoveredPort
      });
    });

    // --------------------------------------------------------
    // BIND LOCAL UDP SOCKET
    // --------------------------------------------------------

    socket.bind(0, "0.0.0.0", () => {
      const localAddress = socket.address();

      console.log("");
      console.log("✅ UDP socket bound.");
      console.log(
        `📡 Local UDP address: ${localAddress.address}`
      );
      console.log(
        `🔢 Local UDP port: ${localAddress.port}`
      );

      // ------------------------------------------------------
      // BUILD DISCORD IP DISCOVERY PACKET
      // ------------------------------------------------------

      const packet = Buffer.alloc(74);

      // Packet type = 1
      packet.writeUInt16BE(1, 0);

      // Packet length = 70
      packet.writeUInt16BE(70, 2);

      // SSRC
      packet.writeUInt32BE(Number(ssrc) >>> 0, 4);

      console.log("");
      console.log("📦 Discord Voice discovery packet created.");
      console.log(`📦 Packet size: ${packet.length} bytes`);
      console.log("📦 Packet type: 1");
      console.log("📦 Packet length field: 70");
      console.log(`📦 SSRC: ${ssrc}`);

      // ------------------------------------------------------
      // SEND DISCOVERY PACKET
      // ------------------------------------------------------

      console.log("");
      console.log("🚀 Sending Discord Voice UDP discovery packet...");

      socket.send(
        packet,
        0,
        packet.length,
        voicePort,
        targetIP,
        error => {
          if (error) {
            if (finished) {
              return;
            }

            finished = true;

            console.error("❌ FAILED TO SEND DISCOVERY PACKET");
            console.error(error.message);

            cleanup();

            resolve({
              success: false,
              reason: error.message
            });

            return;
          }

          console.log("✅ Discovery packet sent.");
          console.log("⏳ Waiting for Discord Voice UDP response...");
        }
      );
    });

    // --------------------------------------------------------
    // TIMEOUT
    // --------------------------------------------------------

    setTimeout(() => {
      if (finished) {
        return;
      }

      finished = true;

      console.error("");
      console.error("========================================");
      console.error("❌ DISCORD VOICE UDP DISCOVERY TIMEOUT");
      console.error("========================================");

      console.error(
        `❌ No UDP response received from ${targetIP}:${voicePort}`
      );

      console.error("");
      console.error(
        "This means the bot could send the Discord Voice discovery packet,"
      );

      console.error(
        "but no response came back to the Render server."
      );

      cleanup();

      resolve({
        success: false,
        reason: "No UDP response received"
      });
    }, 10000);
  });
}

// ============================================================
// BOT READY
// ============================================================

client.once("ready", async () => {
  console.log("🤖 COZY MUSIC BOT ONLINE");
  console.log(`👤 Logged in as ${client.user.tag}`);

  await registerCommands();

  await runBasicUDPDiagnostic();
});

// ============================================================
// /PLAY
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== "play") {
    return;
  }

  console.log(`🎵 /play used by ${interaction.user.tag}`);

  // ==========================================================
  // IMMEDIATELY ACKNOWLEDGE DISCORD
  // ==========================================================

  try {
    await interaction.deferReply();

    console.log("✅ Discord interaction acknowledged.");
  } catch (error) {
    console.error("❌ Could not acknowledge interaction.");
    console.error(error);
    return;
  }

  // ==========================================================
  // CHECK VOICE CHANNEL
  // ==========================================================

  const member = interaction.member;

  if (!member || !member.voice || !member.voice.channel) {
    await interaction.editReply(
      "❌ You need to join a voice channel first!"
    );

    return;
  }

  const voiceChannel = member.voice.channel;

  console.log(
    `🔊 Joining voice channel: ${voiceChannel.name}`
  );

  console.log(
    `🆔 Voice Channel ID: ${voiceChannel.id}`
  );

  console.log(
    `🆔 Guild ID: ${voiceChannel.guild.id}`
  );

  // ==========================================================
  // JOIN DISCORD VOICE
  // ==========================================================

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

    console.log(
      `📡 Initial voice state: ${connection.state.status}`
    );

    // --------------------------------------------------------
    // VOICE STATE
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
      const safeMessage = String(message)
        .replace(
          /"token":"[^"]+"/g,
          '"token":"[REDACTED]"'
        )
        .replace(
          /"session_id":"[^"]+"/g,
          '"session_id":"[REDACTED]"'
        )
        .replace(
          /"sessionId":"[^"]+"/g,
          '"sessionId":"[REDACTED]"'
        );

      console.log(`🌐 VOICE DEBUG: ${safeMessage}`);
    });

    // --------------------------------------------------------
    // VOICE ERROR
    // --------------------------------------------------------

    connection.on("error", error => {
      console.error("❌ VOICE CONNECTION ERROR");
      console.error(error);
    });

    // --------------------------------------------------------
    // NETWORK ERROR
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

    await interaction.editReply(
      "🔊 Joining Discord voice and testing the voice connection..."
    );

    // ========================================================
    // WAIT FOR VOICE NETWORKING TO PROVIDE UDP INFORMATION
    // ========================================================

    console.log(
      "⏳ Waiting for Discord Voice networking information..."
    );

    try {
      await entersState(
        connection,
        VoiceConnectionStatus.Connecting,
        10000
      );
    } catch {}

    // --------------------------------------------------------
    // Give Discord a few seconds to deliver voice server info.
    // --------------------------------------------------------

    let discoveryAttempted = false;

    for (let attempt = 1; attempt <= 20; attempt++) {
      console.log(
        `🔎 Checking Discord Voice networking information... ${attempt}/20`
      );

      const state = connection.state;

      if (state.networking) {
        const networking = state.networking;

        // ----------------------------------------------------
        // IMPORTANT:
        // The networking object internally receives Discord's
        // OP 2 Ready packet containing IP, port and SSRC.
        // ----------------------------------------------------

        if (
          networking.state &&
          networking.state.udp &&
          networking.state.udp.remote
        ) {
          const remote = networking.state.udp.remote;

          console.log(
            "🎯 Discord Voice UDP information found!"
          );

          console.log(
            `🌐 UDP host: ${remote.hostname || remote.address || "unknown"}`
          );

          console.log(
            `🔢 UDP port: ${remote.port || "unknown"}`
          );
        }
      }

      // ------------------------------------------------------
      // Inspect networking object for Discord's UDP socket.
      // ------------------------------------------------------

      if (
        state.networking &&
        state.networking.state &&
        state.networking.state.udp
      ) {
        const udp = state.networking.state.udp;

        console.log(
          "📡 Discord Voice UDP socket exists."
        );

        // If discord.js has already opened its UDP socket,
        // we can report its state.
        if (udp.remote) {
          console.log(
            `🎯 Discord UDP remote: ${
              udp.remote.hostname ||
              udp.remote.address ||
              "unknown"
            }:${udp.remote.port || "unknown"}`
          );
        }
      }

      // ------------------------------------------------------
      // If the normal library has already reached READY,
      // let it continue normally.
      // ------------------------------------------------------

      if (
        connection.state.status === VoiceConnectionStatus.Ready
      ) {
        console.log(
          "🎉 Discord Voice reached READY."
        );

        break;
      }

      // ------------------------------------------------------
      // Check whether networking has already closed.
      // ------------------------------------------------------

      if (
        connection.state.networking &&
        connection.state.networking.state &&
        connection.state.networking.state.code === 6
      ) {
        console.error(
          "❌ Discord networking closed before UDP became ready."
        );

        break;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );
    }

    // ========================================================
    // NORMAL VOICE READY
    // ========================================================

    if (
      connection.state.status === VoiceConnectionStatus.Ready
    ) {
      console.log("");
      console.log("========================================");
      console.log("🎉🎉🎉 VOICE CONNECTION READY 🎉🎉🎉");
      console.log("========================================");
      console.log("");

    } else {
      console.log("");
      console.log("========================================");
      console.log("🔎 VOICE CONNECTION DID NOT REACH READY");
      console.log("========================================");

      console.log(
        `Current voice state: ${connection.state.status}`
      );

      if (connection.state.networking) {
        console.log(
          `Current networking state: ${connection.state.networking.state.code}`
        );
      }

      // ------------------------------------------------------
      // IMPORTANT
      //
      // The actual Discord Voice UDP endpoint is supplied by
      // Discord's OP 2 Ready packet. If the library closes
      // before exposing it, we cannot safely perform the
      // exact discovery test ourselves.
      //
      // We therefore report the failure rather than inventing
      // an endpoint or using discord.com:443.
      // ------------------------------------------------------

      await interaction.editReply(
        "❌ Discord Voice closed before the UDP discovery stage. Check the Render logs for the networking state."
      );

      return;
    }

    // ========================================================
    // MUSIC FILE
    // ========================================================

    const musicFile = path.join(
      __dirname,
      "music",
      "starlight.mp3.mp3"
    );

    console.log(
      `🎵 Looking for music file: ${musicFile}`
    );

    if (!fs.existsSync(musicFile)) {
      console.error("❌ MUSIC FILE NOT FOUND!");

      await interaction.editReply(
        "❌ I connected to Discord voice, but I could not find the music file."
      );

      return;
    }

    console.log("✅ Music file found.");

    // ========================================================
    // AUDIO PLAYER
    // ========================================================

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

    // ========================================================
    // AUDIO RESOURCE
    // ========================================================

    console.log("🎵 Creating audio resource...");

    const resource = createAudioResource(
      musicFile,
      {
        inlineVolume: true
      }
    );

    resource.volume.setVolume(0.5);

    // ========================================================
    // SUBSCRIBE
    // ========================================================

    console.log(
      "🔗 Subscribing audio player to voice connection..."
    );

    connection.subscribe(player);

    // ========================================================
    // PLAY
    // ========================================================

    console.log("▶️ Starting music...");

    player.play(resource);

    // ========================================================
    // LOOP
    // ========================================================

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(
        "🔁 Song finished. Restarting..."
      );

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
        console.error(
          "❌ Error restarting music:"
        );

        console.error(error);
      }
    });

    console.log(
      "🎶 Music playback started."
    );

    await interaction.editReply(
      "🎶 Cozy Music is now playing!"
    );

  } catch (error) {
    console.error(
      "❌ ERROR WHILE JOINING VOICE"
    );

    console.error(error);

    try {
      await interaction.editReply(
        "❌ Something went wrong while connecting to Discord voice."
      );
    } catch {}
  }
});

// ============================================================
// LOGIN
// ============================================================

console.log("🔑 Logging into Discord...");

client.login(DISCORD_TOKEN).catch(error => {
  console.error("❌ Discord login failed!");
  console.error(error);
});