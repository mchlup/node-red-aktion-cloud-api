module.exports = function(RED) {
    const axios = require('axios');
    const TOKEN_EXPIRY = 15000;  // 15 sekund
    const MAX_RETRIES = 3;

    function AktionCloudTokenNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const email = node.credentials.email;
        const apiKey = node.credentials.apiKey;
        const apiUrl = config.apiUrl || "https://cloud.aktion.cz/api";
        node.tokenCache = null;
        node.tokenTimestamp = 0;

        async function getToken(retryCount = 0) {
            const now = Date.now();
            if (node.tokenCache && (now - node.tokenTimestamp) < TOKEN_EXPIRY) {
                return node.tokenCache;
            }
            try {
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
            } catch (error) {
                if (retryCount < MAX_RETRIES) {
                    await new Promise(res => setTimeout(res, 1000 * (retryCount + 1)));
                    return getToken(retryCount + 1);
                }
                throw error;
            }
        }

        node.on('input', async function(msg, send, done) {
            if (!email || !apiKey) {
                node.status({ fill: "red", shape: "ring", text: "Chybí e-mail nebo API klíč" });
                return done("Není zadán e-mail nebo API klíč.");
            }
            node.status({ fill: "blue", shape: "dot", text: "Přihlašuji..." });
            try {
                const token = await getToken();
                node.status({ fill: "green", shape: "dot", text: "Přihlášeno" });
                send({ payload: { token: token } });
                done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: "Chyba přihlášení" });
                done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-token", AktionCloudTokenNode);
};
