const axios = require('axios');

module.exports = function(RED) {
    const CACHE_TTL = 30000; // 30 seconds
    const RATE_LIMIT_WINDOW = 60000; // 1 minute
    const MAX_REQUESTS = 30; // max 30 requests per minute
    
    function AktionCloudPresenceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.aktionCloudConfig = RED.nodes.getNode(config.aktionCloud);
        node.presenceCache = null;
        node.presenceTimestamp = 0;
        node.requestCount = 0;
        node.requestResetTime = Date.now();

        function checkRateLimit() {
            const now = Date.now();
            if (now - node.requestResetTime >= RATE_LIMIT_WINDOW) {
                node.requestCount = 0;
                node.requestResetTime = now;
            }
            if (node.requestCount >= MAX_REQUESTS) {
                throw new Error("Rate limit exceeded");
            }
            node.requestCount++;
        }

        async function getPresence(token) {
            const now = Date.now();
            
            // Return cached presence if recent
            if (node.presenceCache && (now - node.presenceTimestamp) < CACHE_TTL) {
                return node.presenceCache;
            }

            checkRateLimit();

            const apiUrl = node.aktionCloudConfig.apiUrl || "https://cloud.aktion.cz/api";
            
            const response = await axios.get(`${apiUrl}/presence`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            if (response.data) {
                node.presenceCache = response.data;
                node.presenceTimestamp = now;
                return response.data;
            }
            throw new Error("Invalid presence response");
        }

        node.on('input', async function(msg, send, done) {
            if (!node.aktionCloudConfig) {
                node.status({fill: "red", shape: "ring", text: "Chybí připojení"});
                return done("Není zadána konfigurace připojení.");
            }

            if (!msg.payload || !msg.payload.token) {
                node.status({fill: "red", shape: "ring", text: "Chybí token"});
                return done("Není k dispozici přihlašovací token.");
            }

            try {
                node.status({fill: "blue", shape: "dot", text: "Načítám přítomné..."});
                const presence = await getPresence(msg.payload.token);
                node.status({fill: "green", shape: "dot", text: `Načteno (${presence.length || 0} osob)`});
                send([
                    { payload: presence },
                    null,
                    null,
                    null
                ]);
                done();
            } catch (err) {
                node.status({fill: "red", shape: "ring", text: "Chyba"});
                send([
                    { payload: err.message },
                    null,
                    null,
                    null
                ]);
                done(err);
            }
        });
    }

    RED.nodes.registerType("aktion-cloud-presence", AktionCloudPresenceNode);
}
