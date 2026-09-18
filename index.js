require("dotenv").config();

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState
} = require("@discordjs/voice");

const {
  generateDependencyReport
} = require("@discordjs/voice");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

const APPLICATION_ID =
  process.env.APPLICATION_ID || "1550323613708714024";

const GUILD_ID =
  process.env.GUILD_ID || "1316737145901285386";

const VOICE_CHANNEL_ID =
  process.env.VOICE_CHANNEL_ID || "1549830484618383424";

const PORT = process.env.PORT || 10000;

const MUSIC_FOLDER = path.join(__dirname, "music");

const GATEWAY_URL =
  "wss://gateway.discord.gg/?v=10&encoding=json";

const API_BASE =
  "https://discord.com/api/v10";

const INTENTS =
  1 | 128; // GUILDS + GUILD_VOICE_STATES

// IMPORTANT:
// Leave this FALSE.
// The commands already exist in Discord.
// Setting this to TRUE is only needed when we intentionally
// want to update/register the slash commands.
const REGISTER_COMMANDS =
  process.env.REGISTER_COMMANDS === "true";

// ============================================================
// STARTUP
// ============================================================

console.log("");
console.log("========================================");
console.log("🎵 COZY MUSIC");
console.log("========================================");
console.log("");
console.log("Node.js:", process.version);
console.log("Application ID:", APPLICATION_ID);
console.log("Guild ID:", GUILD_ID);
console.log("Voice Channel ID:", VOICE_CHANNEL_ID);
console.log("Music folder:", MUSIC_FOLDER);
console.log("----------------------------------------");
console.log("");
console.log("Token found:", !!TOKEN);
console.log("Token will NOT be printed.");
console.log("");
console.log("========================================");
console.log("");

// ============================================================
// TOKEN CHECK
// ============================================================

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

// ============================================================
// WEB SERVER FOR RENDER
// ============================================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Cozy Music is online!");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 Web server listening on port", PORT);
});

// ============================================================
// MUSIC
// ============================================================

let musicFiles = [];

function loadMusicFiles() {
  try {
    if (!fs.existsSync(MUSIC_FOLDER)) {
      console.error("❌ Music folder does not exist:", MUSIC_FOLDER);
      return;
    }

    musicFiles = fs
      .readdirSync(MUSIC_FOLDER)
      .filter(file => {
        return file.toLowerCase().endsWith(".mp3");
      })
      .sort((a, b) => a.localeCompare(b));

    console.log("");
    console.log("🎵 MUSIC FILES FOUND:", musicFiles.length);

    for (const file of musicFiles) {
      console.log("   🎶", file);
    }

    console.log("");
  } catch (error) {
    console.error("❌ Could not read music folder:", error);
  }
}

loadMusicFiles();

// ============================================================
// AUDIO STATE
// ============================================================

let audioPlayer = null;
let voiceConnection = null;
let currentSong = null;
let queue = [];
let currentSongIndex = 0;

// ============================================================
// DISCORD GATEWAY STATE
// ============================================================

let gateway = null;
let heartbeatTimer = null;
let sequence = null;
let sessionId = null;
let botUser = null;

let voiceState = null;
let voiceServer = null;

let voiceAdapterMethods = null;

// ============================================================
// REST RATE LIMIT STATE
// ============================================================

let globalRateLimitedUntil = 0;

// ============================================================
// DISCORD REST REQUEST
// ============================================================

function discordRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const now = Date.now();

    if (globalRateLimitedUntil > now) {
      const waitMs = globalRateLimitedUntil - now;

      return reject(
        new Error(
          `Discord API is temporarily rate limited. Retry in ${Math.ceil(
            waitMs / 1000
          )} seconds.`
        )
      );
    }

    const url = new URL(API_BASE + endpoint);

    const requestBody =
      body !== null ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "User-Agent":
          "CozyMusicBot/1.0 DiscordBot",
        Accept: "application/json"
      }
    };

    if (requestBody !== null) {
      options.headers["Content-Type"] =
        "application/json";

      options.headers["Content-Length"] =
        Buffer.byteLength(requestBody);
    }

    const req = https.request(options, res => {
      let data = "";

      res.setEncoding("utf8");

      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        const status = res.statusCode;

        // ----------------------------------------------------
        // RATE LIMITED
        // ----------------------------------------------------

        if (status === 429) {
          let parsed = {};

          try {
            parsed = JSON.parse(data);
          } catch (_) {}

          let retryAfter =
            Number(parsed.retry_after || 60);

          if (!Number.isFinite(retryAfter)) {
            retryAfter = 60;
          }

          // Add a little safety time.
          retryAfter += 2;

          globalRateLimitedUntil =
            Date.now() + retryAfter * 1000;

          console.error("");
          console.error(
            `⏳ Discord REST rate limit: waiting approximately ${retryAfter} seconds.`
          );
          console.error("");

          return reject(
            new Error(
              `Discord API 429: temporarily rate limited. Retry in ${retryAfter} seconds.`
            )
          );
        }

        // ----------------------------------------------------
        // OTHER ERROR
        // ----------------------------------------------------

        if (status < 200 || status >= 300) {
          return reject(
            new Error(
              `Discord API ${status}: ${data}`
            )
          );
        }

        // ----------------------------------------------------
        // EMPTY RESPONSE
        // ----------------------------------------------------

        if (!data) {
          return resolve(null);
        }

        // ----------------------------------------------------
        // JSON RESPONSE
        // ----------------------------------------------------

        try {
          resolve(JSON.parse(data));
        } catch (_) {
          resolve(data);
        }
      });
    });

    req.on("error", error => {
      reject(error);
    });

    req.setTimeout(15000, () => {
      req.destroy(
        new Error(
          "Discord API request timed out."
        )
      );
    });

    if (requestBody !== null) {
      req.write(requestBody);
    }

    req.end();
  });
}

// ============================================================
// INTERACTION RESPONSE
// ============================================================

async function respondToInteraction(
  interaction,
  content,
  ephemeral = false
) {
  const data = {
    content
  };

  if (ephemeral) {
    data.flags = 64;
  }

  return discordRequest(
    "POST",
    `/interactions/${interaction.id}/${interaction.token}/callback`,
    {
      type: 4,
      data
    }
  );
}

// ============================================================
// DEFER INTERACTION
// ============================================================

async function deferInteraction(
  interaction,
  ephemeral = false
) {
  const data = {};

  if (ephemeral) {
    data.flags = 64;
  }

  return discordRequest(
    "POST",
    `/interactions/${interaction.id}/${interaction.token}/callback`,
    {
      type: 5,
      data
    }
  );
}

// ============================================================
// EDIT DEFERRED RESPONSE
// ============================================================

async function editInteractionResponse(
  interaction,
  content
) {
  return discordRequest(
    "PATCH",
    `/webhooks/${APPLICATION_ID}/${interaction.token}/messages/@original`,
    {
      content
    }
  );
}

// ============================================================
// REGISTER SLASH COMMANDS
// ============================================================

async function registerSlashCommands() {
  if (!REGISTER_COMMANDS) {
    console.log("");
    console.log(
      "ℹ️ Slash command registration is disabled."
    );
    console.log(
      "ℹ️ Existing Discord commands will be used."
    );
    console.log("");
    return;
  }

  console.log("");
  console.log("========================================");
  console.log("REGISTERING SLASH COMMANDS");
  console.log("========================================");

  const commands = [
    {
      name: "play",
      description: "Play a cozy music track.",
      options: [
        {
          name: "song",
          description: "Choose a music track.",
          type: 3,
          required: true,
          choices: musicFiles
            .slice(0, 25)
            .map(file => ({
              name:
                file.length > 100
                  ? file.substring(0, 100)
                  : file,
              value: file
            }))
        }
      ]
    },

    {
      name: "stop",
      description: "Stop the music."
    },

    {
      name: "pause",
      description: "Pause the music."
    },

    {
      name: "resume",
      description: "Resume the music."
    },

    {
      name: "skip",
      description: "Skip the current song."
    },

    {
      name: "queue",
      description: "Show the music queue."
    }
  ];

  try {
    await discordRequest(
      "PUT",
      `/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
      commands
    );

    console.log(
      "✅ Slash commands registered successfully."
    );
  } catch (error) {
    console.error(
      "❌ Failed to register commands:"
    );

    console.error(error.message);

    console.error("");
    console.error(
      "The bot will continue running."
    );
    console.error("");
  }
}

// ============================================================
// RAW VOICE ADAPTER
// ============================================================

function createVoiceAdapterCreator() {
  return methods => {
    voiceAdapterMethods = methods;

    console.log(
      "🔊 Voice adapter created."
    );

    return {
      sendPayload(data) {
        if (
          !gateway ||
          gateway.readyState !== WebSocket.OPEN
        ) {
          console.error(
            "❌ Cannot send voice payload: Gateway is not open."
          );

          return false;
        }

        try {
          gateway.send(
            JSON.stringify(data)
          );

          return true;
        } catch (error) {
          console.error(
            "❌ Voice payload error:",
            error.message
          );

          return false;
        }
      },

      destroy() {
        console.log(
          "🔊 Voice adapter destroyed."
        );
      }
    };
  };
}

// ============================================================
// CREATE AUDIO PLAYER
// ============================================================

function createMusicPlayer() {
  if (audioPlayer) {
    return audioPlayer;
  }

  audioPlayer =
    createAudioPlayer();

  audioPlayer.on(
    AudioPlayerStatus.Playing,
    () => {
      console.log(
        "▶️ Audio player is playing:",
        currentSong
      );
    }
  );

  audioPlayer.on(
    AudioPlayerStatus.Paused,
    () => {
      console.log(
        "⏸️ Audio player paused."
      );
    }
  );

  audioPlayer.on(
    AudioPlayerStatus.Idle,
    () => {
      console.log(
        "⏹️ Audio player is idle."
      );

      if (currentSong) {
        playNextSong();
      }
    }
  );

  audioPlayer.on(
    "error",
    error => {
      console.error(
        "❌ Audio player error:",
        error.message
      );

      playNextSong();
    }
  );

  return audioPlayer;
}

// ============================================================
// JOIN VOICE CHANNEL
// ============================================================

async function connectToVoice() {
  console.log("");
  console.log(
    "🔊 Connecting to voice channel..."
  );

  if (
    voiceConnection &&
    voiceConnection.state.status !==
      VoiceConnectionStatus.Destroyed
  ) {
    console.log(
      "🔊 Existing voice connection found."
    );

    return voiceConnection;
  }

  voiceConnection =
    joinVoiceChannel({
      channelId: VOICE_CHANNEL_ID,
      guildId: GUILD_ID,
      adapterCreator:
        createVoiceAdapterCreator(),
      selfDeaf: true,
      selfMute: false,
      daveEncryption: true
    });

  voiceConnection.on(
    "stateChange",
    (oldState, newState) => {
      console.log(
        `🔊 Voice state: ${oldState.status} -> ${newState.status}`
      );
    }
  );

  voiceConnection.on(
    "error",
    error => {
      console.error(
        "❌ Voice connection error:",
        error.message
      );
    }
  );

  try {
    await entersState(
      voiceConnection,
      VoiceConnectionStatus.Ready,
      30000
    );

    console.log(
      "✅ Voice connection is READY."
    );

    createMusicPlayer();

    if (audioPlayer) {
      voiceConnection.subscribe(
        audioPlayer
      );
    }

    return voiceConnection;
  } catch (error) {
    console.error("");
    console.error(
      "❌ Voice connection did not become ready."
    );
    console.error(
      error.message
    );
    console.error("");

    try {
      voiceConnection.destroy();
    } catch (_) {}

    voiceConnection = null;

    throw error;
  }
}

// ============================================================
// PLAY SONG
// ============================================================

async function playSong(fileName) {
  if (!fileName) {
    throw new Error(
      "No song was selected."
    );
  }

  const safeName =
    path.basename(fileName);

  const fullPath =
    path.join(
      MUSIC_FOLDER,
      safeName
    );

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Song not found: ${safeName}`
    );
  }

  console.log("");
  console.log(
    "🎵 PLAYING:",
    safeName
  );

  await connectToVoice();

  createMusicPlayer();

  currentSong = safeName;

  const resource =
    createAudioResource(
      fullPath,
      {
        inputType:
          StreamType.Arbitrary
      }
    );

  audioPlayer.play(resource);

  console.log(
    "✅ Audio resource started."
  );
}

// ============================================================
// NEXT SONG
// ============================================================

async function playNextSong() {
  if (!musicFiles.length) {
    console.log(
      "❌ No music files available."
    );

    return;
  }

  currentSongIndex++;

  if (
    currentSongIndex >=
    musicFiles.length
  ) {
    currentSongIndex = 0;
  }

  const nextSong =
    musicFiles[currentSongIndex];

  try {
    await playSong(nextSong);
  } catch (error) {
    console.error(
      "❌ Could not play next song:",
      error.message
    );
  }
}

// ============================================================
// STOP
// ============================================================

function stopMusic() {
  if (audioPlayer) {
    audioPlayer.stop();
  }

  currentSong = null;
  queue = [];

  console.log(
    "⏹️ Music stopped."
  );
}

// ============================================================
// PAUSE
// ============================================================

function pauseMusic() {
  if (!audioPlayer) {
    return false;
  }

  return audioPlayer.pause();
}

// ============================================================
// RESUME
// ============================================================

function resumeMusic() {
  if (!audioPlayer) {
    return false;
  }

  return audioPlayer.unpause();
}

// ============================================================
// SKIP
// ============================================================

async function skipMusic() {
  if (!audioPlayer) {
    return;
  }

  audioPlayer.stop();
}

// ============================================================
// QUEUE TEXT
// ============================================================

function getQueueText() {
  if (!musicFiles.length) {
    return "🎵 No music files found.";
  }

  let text =
    "🎵 **Cozy Music Library**\n\n";

  for (
    let i = 0;
    i < musicFiles.length;
    i++
  ) {
    const marker =
      musicFiles[i] === currentSong
        ? "▶️"
        : "🎶";

    text += `${marker} ${i + 1}. ${musicFiles[i]}\n`;
  }

  return text;
}

// ============================================================
// INTERACTION HANDLER
// ============================================================

async function handleInteraction(
  interaction
) {
  if (
    interaction.type !== 2
  ) {
    return;
  }

  const commandName =
    interaction.data?.name;

  console.log("");
  console.log(
    `🎵 /${commandName} used`
  );

  // ----------------------------------------------------------
  // PLAY
  // ----------------------------------------------------------

  if (commandName === "play") {
    const option =
      interaction.data?.options?.find(
        item =>
          item.name === "song"
      );

    const song =
      option?.value;

    if (!song) {
      try {
        await respondToInteraction(
          interaction,
          "❌ Please choose a song."
        );
      } catch (error) {
        console.error(
          "❌ Could not respond:",
          error.message
        );
      }

      return;
    }

    try {
      // Respond immediately so Discord knows
      // the interaction was received.
      await deferInteraction(
        interaction
      );

      await playSong(song);

      await editInteractionResponse(
        interaction,
        `🎵 Now playing **${song}**`
      );

    } catch (error) {
      console.error(
        "❌ Error handling /play:"
      );

      console.error(
        error.message
      );

      try {
        await editInteractionResponse(
          interaction,
          `❌ ${error.message}`
        );
      } catch (responseError) {
        console.error(
          "❌ Could not send error response:",
          responseError.message
        );
      }
    }

    return;
  }

  // ----------------------------------------------------------
  // STOP
  // ----------------------------------------------------------

  if (commandName === "stop") {
    try {
      await respondToInteraction(
        interaction,
        "⏹️ Music stopped."
      );

      stopMusic();
    } catch (error) {
      console.error(
        "❌ /stop error:",
        error.message
      );
    }

    return;
  }

  // ----------------------------------------------------------
  // PAUSE
  // ----------------------------------------------------------

  if (commandName === "pause") {
    try {
      const success =
        pauseMusic();

      await respondToInteraction(
        interaction,
        success
          ? "⏸️ Music paused."
          : "❌ Nothing is currently playing."
      );
    } catch (error) {
      console.error(
        "❌ /pause error:",
        error.message
      );
    }

    return;
  }

  // ----------------------------------------------------------
  // RESUME
  // ----------------------------------------------------------

  if (commandName === "resume") {
    try {
      const success =
        resumeMusic();

      await respondToInteraction(
        interaction,
        success
          ? "▶️ Music resumed."
          : "❌ Nothing is currently paused."
      );
    } catch (error) {
      console.error(
        "❌ /resume error:",
        error.message
      );
    }

    return;
  }

  // ----------------------------------------------------------
  // SKIP
  // ----------------------------------------------------------

  if (commandName === "skip") {
    try {
      await respondToInteraction(
        interaction,
        "⏭️ Skipping..."
      );

      await skipMusic();
    } catch (error) {
      console.error(
        "❌ /skip error:",
        error.message
      );
    }

    return;
  }

  // ----------------------------------------------------------
  // QUEUE
  // ----------------------------------------------------------

  if (commandName === "queue") {
    try {
      await respondToInteraction(
        interaction,
        getQueueText()
      );
    } catch (error) {
      console.error(
        "❌ /queue error:",
        error.message
      );
    }

    return;
  }
}

// ============================================================
// GATEWAY SEND
// ============================================================

function gatewaySend(payload) {
  if (
    !gateway ||
    gateway.readyState !== WebSocket.OPEN
  ) {
    console.error(
      "❌ Gateway is not open."
    );

    return;
  }

  gateway.send(
    JSON.stringify(payload)
  );
}

// ============================================================
// HEARTBEAT
// ============================================================

function startHeartbeat(interval) {
  if (heartbeatTimer) {
    clearInterval(
      heartbeatTimer
    );
  }

  heartbeatTimer =
    setInterval(() => {
      if (
        !gateway ||
        gateway.readyState !==
          WebSocket.OPEN
      ) {
        return;
      }

      gatewaySend({
        op: 1,
        d: sequence
      });

      console.log(
        "💓 Heartbeat sent."
      );
    }, interval);
}

// ============================================================
// GATEWAY CONNECT
// ============================================================

function connectGateway() {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "🌐 CONNECTING TO DISCORD GATEWAY"
  );
  console.log(
    "========================================"
  );
  console.log("");

  gateway =
    new WebSocket(
      GATEWAY_URL
    );

  gateway.on(
    "open",
    () => {
      console.log(
        "✅ Gateway WebSocket connected."
      );
    }
  );

  gateway.on(
    "message",
    async raw => {
      let packet;

      try {
        packet =
          JSON.parse(
            raw.toString()
          );
      } catch (error) {
        console.error(
          "❌ Invalid Gateway JSON."
        );

        return;
      }

      if (
        packet.s !== undefined &&
        packet.s !== null
      ) {
        sequence = packet.s;
      }

      // ------------------------------------------------------
      // HELLO
      // ------------------------------------------------------

      if (packet.op === 10) {
        console.log("");
        console.log(
          "========================================"
        );
        console.log(
          "🎉 DISCORD HELLO RECEIVED"
        );
        console.log(
          "========================================"
        );

        const interval =
          packet.d.heartbeat_interval;

        console.log(
          "Heartbeat interval:",
          interval,
          "ms"
        );

        startHeartbeat(
          interval
        );

        gatewaySend({
          op: 2,
          d: {
            token: TOKEN,
            intents: INTENTS,
            properties: {
              os: "linux",
              browser: "cozy-music",
              device: "cozy-music"
            }
          }
        });

        console.log("");
        console.log(
          "🔐 SENDING IDENTIFY"
        );
        console.log("");
        console.log(
          "✅ IDENTIFY sent."
        );

        return;
      }

      // ------------------------------------------------------
      // HEARTBEAT ACK
      // ------------------------------------------------------

      if (packet.op === 11) {
        console.log(
          "💓 Heartbeat ACK received."
        );

        return;
      }

      // ------------------------------------------------------
      // INVALID SESSION
      // ------------------------------------------------------

      if (packet.op === 9) {
        console.error(
          "❌ Discord reported an invalid session."
        );

        setTimeout(
          connectGateway,
          5000
        );

        return;
      }

      // ------------------------------------------------------
      // DISPATCH
      // ------------------------------------------------------

      if (packet.op !== 0) {
        return;
      }

      const event =
        packet.t;

      console.log(
        "📡 Gateway event:",
        event
      );

      // ------------------------------------------------------
      // READY
      // ------------------------------------------------------

      if (event === "READY") {
        botUser =
          packet.d.user;

        sessionId =
          packet.d.session_id;

        console.log("");
        console.log(
          "========================================"
        );
        console.log(
          "🎉🎉 COZY MUSIC IS ONLINE 🎉🎉"
        );
        console.log(
          "========================================"
        );
        console.log("");
        console.log(
          "Bot:",
          botUser.username
        );
        console.log(
          "Bot ID:",
          botUser.id
        );
        console.log(
          "Guilds:",
          packet.d.guilds?.length || 0
        );
        console.log("");
        console.log(
          "========================================"
        );
        console.log("");

        // IMPORTANT:
        // Commands are NOT registered automatically.
        await registerSlashCommands();

        return;
      }

      // ------------------------------------------------------
      // VOICE STATE UPDATE
      // ------------------------------------------------------

      if (
        event ===
        "VOICE_STATE_UPDATE"
      ) {
        const data =
          packet.d;

        if (
          data.user_id ===
          APPLICATION_ID
        ) {
          voiceState =
            data;

          console.log(
            "🔊 Bot VOICE_STATE_UPDATE received."
          );

          if (
            voiceAdapterMethods &&
            typeof voiceAdapterMethods
              .onVoiceStateUpdate ===
              "function"
          ) {
            voiceAdapterMethods
              .onVoiceStateUpdate(
                data
              );
          }
        }

        return;
      }

      // ------------------------------------------------------
      // VOICE SERVER UPDATE
      // ------------------------------------------------------

      if (
        event ===
        "VOICE_SERVER_UPDATE"
      ) {
        voiceServer =
          packet.d;

        console.log(
          "🔊 VOICE_SERVER_UPDATE received."
        );

        if (
          voiceAdapterMethods &&
          typeof voiceAdapterMethods
            .onVoiceServerUpdate ===
            "function"
        ) {
          voiceAdapterMethods
            .onVoiceServerUpdate(
              packet.d
            );
        }

        return;
      }

      // ------------------------------------------------------
      // INTERACTION
      // ------------------------------------------------------

      if (
        event ===
        "INTERACTION_CREATE"
      ) {
        await handleInteraction(
          packet.d
        );

        return;
      }
    }
  );

  gateway.on(
    "close",
    (code, reason) => {
      console.error("");
      console.error(
        "❌ Gateway WebSocket closed."
      );
      console.error(
        "Close code:",
        code
      );
      console.error(
        "Reason:",
        reason?.toString() || "none"
      );
      console.error("");

      if (heartbeatTimer) {
        clearInterval(
          heartbeatTimer
        );

        heartbeatTimer = null;
      }

      setTimeout(
        connectGateway,
        5000
      );
    }
  );

  gateway.on(
    "error",
    error => {
      console.error(
        "❌ Gateway WebSocket error:",
        error.message
      );
    }
  );
}

// ============================================================
// START
// ============================================================

console.log(
  "🚀 Starting Cozy Music..."
);

console.log(
  "Voice dependency report:"
);

try {
  console.log(
    generateDependencyReport()
  );
} catch (_) {}

connectGateway();

// ============================================================
// SHUTDOWN
// ============================================================

function shutdown() {
  console.log("");
  console.log(
    "🛑 Shutting down Cozy Music..."
  );

  if (heartbeatTimer) {
    clearInterval(
      heartbeatTimer
    );
  }

  try {
    if (audioPlayer) {
      audioPlayer.stop();
    }
  } catch (_) {}

  try {
    if (voiceConnection) {
      voiceConnection.destroy();
    }
  } catch (_) {}

  try {
    if (gateway) {
      gateway.close();
    }
  } catch (_) {}

  try {
    server.close();
  } catch (_) {}

  process.exit(0);
}

process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);