module.exports = function(RED) {
    const axios = require('axios');
    const TOKEN_EXPIRY = 15000;
    const CACHE_TTL = 30000;
    const RATE_LIMIT_WINDOW = 60000;
    const MAX_REQUESTS = 30;

    function AktionCloudPresenceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const email = node.credentials.email;
        const apiKey = node.credentials.apiKey;
        const apiUrl = config.apiUrl || "https://cloud.aktion.cz/api";
        const intervalSec = parseInt(config.interval) || 0;
        node.presenceCache = null;
        node.presenceTimestamp = 0;
        node.tokenCache = null;
        node.tokenTimestamp = 0;
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

        async function getToken() {
            const now = Date.now();
            if (node.tokenCache && (now - node.tokenTimestamp) < TOKEN_EXPIRY) {
                return node.tokenCache;
            }
            const response = await axios.post(`${apiUrl}/login`, {
                email: email,
                apiKey: apiKey
            }, { timeout: 5000 });
            if (response.data && response.data.token) {
                node.tokenCache = response.data.token;
                node.tokenTimestamp = now;
                return node.tokenCache;
            }
            throw new Error("Invalid token response");
        }

        async function getPresence(token) {
            const now = Date.now();
            if (node.presenceCache && (now - node.presenceTimestamp) < CACHE_TTL) {
                return node.presenceCache;
            }
            checkRateLimit();
            const response = await axios.get(`${apiUrl}/presence`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000
            });
            if (response.data) {
                node.presenceCache = response.data;
                node.presenceTimestamp = now;
                return node.presenceCache;
            }
            throw new Error("Invalid presence response");
        }

        async function processPresence(send) {
            node.status({ fill: "blue", shape: "dot", text: "Načítám přítomné..." });
            const token = await getToken();
            const presence = await getPresence(token);
            const count = Array.isArray(presence) ? presence.length : 0;
            node.status({ fill: "green", shape: "dot", text: `Načteno (${count} osob)` });

            let lastName = "", lastLogin = "";
            let lastId = null;
            if (count > 0) {
                const last = presence[presence.length - 1];
                if (last) {
                    lastId = last.personId || last.PersonId || last.id;
                    if (last.name) lastName = last.name;
                    if (last.login) lastLogin = last.login;
                    if ((!lastName || !lastLogin) && lastId) {
                        // Dohledání detailu osoby, pokud není v datech
                        try {
                            const detailResp = await axios.get(`${apiUrl}/Person/get?PersonId=${lastId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            const detail = detailResp.data;
                            if (detail) {
                                if (!lastName && (detail.firstName || detail.lastName)) {
                                    lastName = ((detail.firstName || "") + " " + (detail.lastName || "")).trim();
                                }
                                if (!lastLogin && detail.login) lastLogin = detail.login;
                            }
                        } catch {}
                    }
                }
            }

            let out1 = { payload: lastName || "" };
            let out2 = { payload: lastId || null };
            let out3 = { payload: lastLogin || "" };
            let out4 = { payload: presence };
            send([out1, out2, out3, out4]);
        }

        // Automatický polling
        if (intervalSec > 0 && email && apiKey) {
            node.intervalId = setInterval(() => {
                processPresence(node.send.bind(node)).catch(err => {
                    node.status({ fill: "red", shape: "ring", text: "Chyba" });
                });
            }, intervalSec * 1000);
        }

        // Ručně na vstupní zprávu
        node.on('input', async function(msg, send, done) {
            let token = msg.token || (msg.payload && msg.payload.token);
            try {
                if (!token) {
                    if (!email || !apiKey) {
                        node.status({ fill: "red", shape: "ring", text: "Chybí e-mail nebo API klíč" });
                        return done("Není k dispozici token ani přihlašovací údaje.");
                    }
                    token = await getToken();
                }
                const presence = await getPresence(token);
                const count = Array.isArray(presence) ? presence.length : 0;
                node.status({ fill: "green", shape: "dot", text: `Načteno (${count} osob)` });

                let lastName = "", lastLogin = "";
                let lastId = null;
                if (count > 0) {
                    const last = presence[presence.length - 1];
                    if (last) {
                        lastId = last.personId || last.PersonId || last.id;
                        if (last.name) lastName = last.name;
                        if (last.login) lastLogin = last.login;
                        if ((!lastName || !lastLogin) && lastId) {
                            try {
                                const detailResp = await axios.get(`${apiUrl}/Person/get?PersonId=${lastId}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                const detail = detailResp.data;
                                if (!lastName && (detail.firstName || detail.lastName)) {
                                    lastName = ((detail.firstName || "") + " " + (detail.lastName || "")).trim();
                                }
                                if (!lastLogin && detail.login) lastLogin = detail.login;
                            } catch {}
                        }
                    }
                }
                send([
                    { payload: lastName || "" },
                    { payload: lastId || null },
                    { payload: lastLogin || "" },
                    { payload: presence }
                ]);
                done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: "Chyba" });
                send([ { payload: err.message }, null, null, null ]);
                done(err);
            }
        });

        node.on('close', function() {
            if (node.intervalId) clearInterval(node.intervalId);
        });
    }
    RED.nodes.registerType("aktion-cloud-presence", AktionCloudPresenceNode);
};
