const axios = require('axios');

module.exports = function(RED) {
    const TOKEN_EXPIRY = 15000;
    const MAX_RETRIES = 3;
    
    function AktionCloudTokenNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.name = config.name;
        node.email = config.email;
        node.apiKey = config.apiKey;
        node.apiUrl = config.apiUrl || "https://cloud.aktion.cz/api";
        node.debug = config.debug || false;
        node.tokenCache = null;
        node.tokenTimestamp = 0;

        async function getToken(retryCount = 0) {
            const now = Date.now();
            if (node.tokenCache && (now - node.tokenTimestamp) < TOKEN_EXPIRY) {
                return node.tokenCache;
            }
            try {
                const response = await axios.post(`${node.apiUrl}/login`, {
                    email: node.email,
                    apiKey: node.apiKey
                }, {
                    timeout: 5000
                });
                if (response.data && response.data.token) {
                    node.tokenCache = response.data.token;
                    node.tokenTimestamp = now;
                    return response.data.token;
                }
                throw new Error("Invalid token response");
            } catch (error) {
                if (retryCount < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                    return getToken(retryCount + 1);
                }
                throw error;
            }
        }

        node.on('input', async function(msg, send, done) {
            if (!node.email || !node.apiKey) {
                node.status({fill:"red", shape:"ring", text:"Chybí e-mail nebo API klíč"});
                done("Chybí e-mail nebo API klíč!");
                return;
            }
            node.status({fill:"blue", shape:"dot", text:"Přihlašuji..."});
            try {
                const token = await getToken();
                node.status({fill:"green", shape:"dot", text:"Přihlášeno"});
                send({ payload: { token } });
                if (node.debug) {
                    node.log("Token získán: " + token);
                }
                done();
            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"Chyba přihlášení"});
                done(err);
            }
        });
    }

    RED.nodes.registerType("aktion-cloud-token", AktionCloudTokenNode);
}
