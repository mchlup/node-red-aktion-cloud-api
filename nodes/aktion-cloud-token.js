const axios = require('axios');

module.exports = function(RED) {
    const TOKEN_EXPIRY = 15000; // 15 seconds (5s buffer from 20s max)
    const MAX_RETRIES = 3;
    
    function AktionCloudTokenNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.aktionCloudConfig = RED.nodes.getNode(config.aktionCloud);
        node.tokenCache = null;
        node.tokenTimestamp = 0;

        async function getToken(retryCount = 0) {
            const now = Date.now();
            
            // Return cached token if still valid
            if (node.tokenCache && (now - node.tokenTimestamp) < TOKEN_EXPIRY) {
                return node.tokenCache;
            }

            const apiUrl = node.aktionCloudConfig.apiUrl || "https://cloud.aktion.cz/api";
            
            try {
                const response = await axios.post(`${apiUrl}/login`, {
                    email: node.aktionCloudConfig.email,
                    apiKey: node.aktionCloudConfig.apiKey
                }, {
                    timeout: 5000 // 5 second timeout
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
            node.status({fill:"blue", shape:"dot", text:"Přihlašuji..."});
            
            if (!node.aktionCloudConfig || !node.aktionCloudConfig.email || !node.aktionCloudConfig.apiKey) {
                node.status({fill:"red", shape:"ring", text:"Chybí připojení"});
                done("Není zadána konfigurace připojení.");
                return;
            }

            try {
                const token = await getToken();
                node.status({fill:"green", shape:"dot", text:"Přihlášeno"});
                send({ payload: { token } });
                done();
            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"Chyba přihlášení"});
                done(err);
            }
        });
    }

    RED.nodes.registerType("aktion-cloud-token", AktionCloudTokenNode);
}
