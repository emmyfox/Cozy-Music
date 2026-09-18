require("dotenv").config();

const dns = require("dns");
const WebSocket = require("ws");

console.log("========================================");
console.log("COZY MUSIC - DIRECT GATEWAY TEST");
console.log("========================================");

console.log("Node.js:", process.version);

if (!process.env.DISCORD_TOKEN) {
    console.error("ERROR: DISCORD_TOKEN is missing.");
    process.exit(1);
}

console.log("DISCORD_TOKEN found.");
console.log("");

console.log("========================================");
console.log("TEST 1 - DISCORD GATEWAY DNS");
console.log("========================================");

dns.resolve4(
    "gateway.discord.gg",
    (error, addresses) => {
        if (error) {
            console.error(
                "DNS ERROR:",
                error.message
            );

            process.exit(1);
        }

        console.log(
            "gateway.discord.gg resolved successfully."
        );

        for (const address of addresses) {
            console.log(
                "   " + address
            );
        }

        startWebSocketTest();
    }
);

function startWebSocketTest() {
    console.log("");
    console.log("========================================");
    console.log("TEST 2 - DIRECT DISCORD WEBSOCKET");
    console.log("========================================");

    const gatewayURL =
        "wss://gateway.discord.gg/?v=10&encoding=json";

    console.log(
        "Connecting to:",
        gatewayURL
    );

    console.log("");
    console.log(
        "Waiting for Discord Gateway..."
    );

    let finished = false;

    const socket =
        new WebSocket(
            gatewayURL,
            {
                handshakeTimeout: 15000
            }
        );

    const timeout =
        setTimeout(
            () => {
                if (finished) {
                    return;
                }

                console.error("");
                console.error(
                    "========================================"
                );

                console.error(
                    "WEBSOCKET TIMEOUT"
                );

                console.error(
                    "========================================"
                );

                console.error(
                    "Render connected to DNS, but the direct WebSocket connection did not finish within 15 seconds."
                );

                finished = true;

                try {
                    socket.close();
                } catch {}

                process.exit(1);
            },
            20000
        );

    socket.on(
        "open",
        () => {
            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "WEBSOCKET CONNECTED"
            );

            console.log(
                "========================================"
            );

            console.log(
                "Render successfully opened a WebSocket connection to Discord."
            );

            console.log("");
            console.log(
                "Waiting for Discord HELLO..."
            );
        }
    );

    socket.on(
        "message",
        (data) => {
            try {
                const packet =
                    JSON.parse(
                        data.toString()
                    );

                console.log("");
                console.log(
                    "DISCORD GATEWAY PACKET RECEIVED"
                );

                console.log(
                    "Opcode:",
                    packet.op
                );

                if (packet.op === 10) {
                    console.log(
                        "SUCCESS: Discord sent HELLO."
                    );

                    console.log(
                        "Heartbeat interval:",
                        packet.d?.heartbeat_interval,
                        "ms"
                    );

                    console.log("");
                    console.log(
                        "========================================"
                    );

                    console.log(
                        "DIRECT WEBSOCKET TEST PASSED"
                    );

                    console.log(
                        "========================================"
                    );

                    console.log(
                        "Render can connect to the Discord Gateway."
                    );

                    console.log(
                        "The problem is therefore happening inside the bot login/handshake after the WebSocket connection."
                    );

                    finished = true;

                    clearTimeout(timeout);

                    try {
                        socket.close();
                    } catch {}

                    setTimeout(
                        () => {
                            process.exit(0);
                        },
                        1000
                    );
                } else {
                    console.log(
                        "Gateway packet data received."
                    );
                }
            } catch (error) {
                console.error(
                    "Could not read Gateway packet:"
                );

                console.error(
                    error.message
                );
            }
        }
    );

    socket.on(
        "error",
        (error) => {
            if (finished) {
                return;
            }

            console.error("");
            console.error(
                "========================================"
            );

            console.error(
                "WEBSOCKET ERROR"
            );

            console.error(
                "========================================"
            );

            console.error(
                error.message
            );

            finished = true;

            clearTimeout(timeout);

            process.exit(1);
        }
    );

    socket.on(
        "close",
        (code, reason) => {
            if (finished) {
                return;
            }

            console.error("");
            console.error(
                "========================================"
            );

            console.error(
                "WEBSOCKET CLOSED"
            );

            console.error(
                "========================================"
            );

            console.error(
                "Close code:",
                code
            );

            console.error(
                "Reason:",
                reason
                    ? reason.toString()
                    : "No reason supplied"
            );

            finished = true;

            clearTimeout(timeout);

            process.exit(1);
        }
    );
}