require("dotenv").config();

const WebSocket = require("ws");
const http = require("http");

console.log("========================================");
console.log("COZY MUSIC - DIRECT IDENTIFY TEST");
console.log("========================================");

console.log("Node.js:", process.version);

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("Token will NOT be printed.");

//
// ---------------------------------------------------------
// RENDER WEB SERVER
// ---------------------------------------------------------
//

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("Cozy Music Discord Gateway test is running.\n");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log("WEB SERVER STARTED");
    console.log("========================================");
    console.log("Port:", PORT);
    console.log("========================================");
});

//
// ---------------------------------------------------------
// DISCORD GATEWAY TEST
// ---------------------------------------------------------
//

const gatewayUrl =
    "wss://gateway.discord.gg/?v=10&encoding=json";

console.log("");
console.log("========================================");
console.log("DIRECT DISCORD GATEWAY IDENTIFY TEST");
console.log("========================================");

console.log("Connecting to Discord:");
console.log(gatewayUrl);

const ws = new WebSocket(gatewayUrl);

let identified = false;
let receivedReady = false;
let heartbeatTimer = null;
let testFinished = false;

//
// ---------------------------------------------------------
// WEBSOCKET OPEN
// ---------------------------------------------------------
//

ws.on("open", () => {
    console.log("");
    console.log("========================================");
    console.log("✅ WEBSOCKET CONNECTED");
    console.log("========================================");

    console.log("Render successfully connected to Discord.");
    console.log("Waiting for Discord HELLO...");

    console.log("========================================");
});

//
// ---------------------------------------------------------
// DISCORD PACKETS
// ---------------------------------------------------------
//

ws.on("message", (data) => {
    let packet;

    try {
        packet = JSON.parse(data.toString());
    } catch (error) {
        console.error("❌ Could not parse Discord packet.");
        console.error(error);
        return;
    }

    console.log("");
    console.log("========================================");
    console.log("DISCORD PACKET RECEIVED");
    console.log("========================================");

    console.log("Opcode:", packet.op);

    //
    // HELLO
    //
    if (packet.op === 10) {
        console.log("Discord sent HELLO.");

        const heartbeatInterval =
            packet.d?.heartbeat_interval;

        console.log(
            "Heartbeat interval:",
            heartbeatInterval,
            "ms"
        );

        if (!heartbeatInterval) {
            console.error(
                "❌ Discord HELLO did not contain heartbeat_interval."
            );

            finishTest(false);
            return;
        }

        console.log("");
        console.log("========================================");
        console.log("SENDING IDENTIFY");
        console.log("========================================");

        const identifyPayload = {
            op: 2,
            d: {
                token: process.env.DISCORD_TOKEN,

                intents:
                    (1 << 0) |
                    (1 << 9) |
                    (1 << 12),

                properties: {
                    os: "linux",
                    browser: "cozy-music",
                    device: "cozy-music"
                }
            }
        };

        console.log("Identify opcode:", identifyPayload.op);
        console.log("Identify token: [REDACTED]");
        console.log(
            "Identify intents:",
            identifyPayload.d.intents
        );

        ws.send(JSON.stringify(identifyPayload));

        identified = true;

        console.log("");
        console.log("✅ IDENTIFY SENT");
        console.log("Waiting for Discord READY...");
        console.log("========================================");

        //
        // HEARTBEAT
        //
        heartbeatTimer = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                return;
            }

            console.log("💓 Sending heartbeat.");

            ws.send(
                JSON.stringify({
                    op: 1,
                    d: null
                })
            );
        }, heartbeatInterval);
    }

    //
    // READY
    //
    else if (packet.op === 0 && packet.t === "READY") {
        receivedReady = true;

        console.log("");
        console.log("========================================");
        console.log("🎉🎉🎉 DISCORD READY RECEIVED 🎉🎉🎉");
        console.log("========================================");

        console.log("SUCCESS!");
        console.log("");
        console.log(
            "Render can connect to Discord AND successfully IDENTIFY."
        );

        console.log("");
        console.log("Bot user ID:");
        console.log(
            packet.d?.user?.id || "[not provided]"
        );

        console.log("");
        console.log("Bot username:");
        console.log(
            packet.d?.user?.username || "[not provided]"
        );

        console.log("");
        console.log("Guild count received:");
        console.log(
            packet.d?.guilds?.length ?? "[not provided]"
        );

        console.log("");
        console.log("========================================");
        console.log("DIRECT IDENTIFY TEST PASSED");
        console.log("========================================");

        finishTest(true);
    }

    //
    // HEARTBEAT ACK
    //
    else if (packet.op === 11) {
        console.log("💓 Discord heartbeat ACK received.");
    }

    //
    // INVALID SESSION
    //
    else if (packet.op === 9) {
        console.error("");
        console.error("========================================");
        console.error("❌ DISCORD INVALID SESSION");
        console.error("========================================");

        console.error(
            "Can resume:",
            packet.d
        );

        finishTest(false);
    }

    //
    // RECONNECT
    //
    else if (packet.op === 7) {
        console.warn("");
        console.warn("========================================");
        console.warn("⚠️ DISCORD REQUESTED RECONNECT");
        console.warn("========================================");

        finishTest(false);
    }

    //
    // OTHER DISPATCHES
    //
    else {
        console.log(
            "Event:",
            packet.t || "none"
        );
    }
});

//
// ---------------------------------------------------------
// WEBSOCKET ERROR
// ---------------------------------------------------------
//

ws.on("error", (error) => {
    console.error("");
    console.error("========================================");
    console.error("❌ WEBSOCKET ERROR");
    console.error("========================================");

    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);

    console.error(error);

    console.error("========================================");
});

//
// ---------------------------------------------------------
// WEBSOCKET CLOSE
// ---------------------------------------------------------
//

ws.on("close", (code, reason) => {
    console.log("");
    console.log("========================================");
    console.log("🔴 DISCORD WEBSOCKET CLOSED");
    console.log("========================================");

    console.log("Close code:", code);

    console.log(
        "Close reason:",
        reason?.toString() || "No reason"
    );

    console.log("Identified:", identified);
    console.log("Received READY:", receivedReady);

    console.log("========================================");

    if (!receivedReady && !testFinished) {
        console.error("");
        console.error(
            "❌ Discord closed the connection before READY."
        );
    }
});

//
// ---------------------------------------------------------
// TEST TIMEOUT
// ---------------------------------------------------------
//

setTimeout(() => {
    if (receivedReady) {
        return;
    }

    console.error("");
    console.error("========================================");
    console.error("⏰ 30 SECOND IDENTIFY TIMEOUT");
    console.error("========================================");

    console.error(
        "Connected:",
        ws.readyState === WebSocket.OPEN
    );

    console.error(
        "IDENTIFY sent:",
        identified
    );

    console.error(
        "READY received:",
        receivedReady
    );

    console.error(
        "Discord did not send READY within 30 seconds."
    );

    console.error("========================================");

    finishTest(false);
}, 30000);

//
// ---------------------------------------------------------
// FINISH
// ---------------------------------------------------------
//

function finishTest(success) {
    if (testFinished) {
        return;
    }

    testFinished = true;

    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    setTimeout(() => {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        } catch (error) {
            console.error("Error closing WebSocket:", error);
        }

        console.log("");
        console.log("========================================");

        if (success) {
            console.log("🎉 DIRECT IDENTIFY TEST PASSED");
        } else {
            console.log("❌ DIRECT IDENTIFY TEST FAILED");
        }

        console.log("========================================");

        //
        // Keep Render's web service alive briefly so
        // the final logs are visible.
        //
        setTimeout(() => {
            process.exit(success ? 0 : 1);
        }, 2000);
    }, 1000);
}