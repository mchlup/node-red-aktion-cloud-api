const axios = require('axios');

module.exports = function(RED) {
    function AktionCloudTokenNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.aktionCloudConfig = RED.nodes.getNode(config.aktionCloud);

        node.on('input', async function(msg, send, done) {
            node.status({fill:"blue", shape:"dot", text:"Přihlašuji..."});
            if (!node.aktionCloudConfig || !node.aktionCloudConfig.email || !node.aktionCloudConfig.apiKey) {
                node.status({fill:"red", shape:"ring", text:"Chybí připojení"});
                done("Není zadána konfigurace připojení.");
                return;
            }
            const apiUrl = node.aktionCloudConfig.apiUrl || "https://cloud.aktion.cz/api";
            try {
                const response = await axios.post(`${apiUrl}/login`, {
                    email: node.aktionCloudConfig.email,
                    apiKey: node.aktionCloudConfig.apiKey
                });
                if (response.data && response.data.token) {
                    msg.token = response.data.token;
                    node.status({fill:"green", shape:"dot", text:"Token OK"});
                    send(msg);
                    done();
                } else {
                    node.status({fill:"red", shape:"ring", text:"Chyba tokenu"});
                    done("Token nebyl vrácen.");
                }
            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"Chyba přihlášení"});
                done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-token", AktionCloudTokenNode);
};
