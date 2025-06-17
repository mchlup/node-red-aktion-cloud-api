const axios = require("axios");

module.exports = function(RED) {
    function AktionCloudTokenNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.configNode = RED.nodes.getNode(config.aktionCloud);

        node.status({fill:"grey", shape:"ring", text:"waiting for trigger"});

        node.on('input', async function(msg, send, done) {
            node.status({fill:"blue", shape:"dot", text:"getting token"});
            try {
                const { email, apiKey, apiUrl } = node.configNode;
                const { data } = await axios.post(
                    `${apiUrl}/login`,
                    { email, apiKey }
                );
                msg.token = data.token;
                node.status({fill:"green", shape:"dot", text:"token OK"});
                send(msg);
                if (done) done();
            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"token error"});
                node.error("Chyba získání tokenu: " + err.message, msg);
                if (done) done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-token", AktionCloudTokenNode);
};
