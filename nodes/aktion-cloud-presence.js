const axios = require("axios");

module.exports = function(RED) {
    function AktionCloudPresenceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.configNode = RED.nodes.getNode(config.aktionCloud);

        node.on('input', async function(msg, send, done) {
            const token = msg.token || config.token;
            if (!token) {
                node.status({fill:"red", shape:"ring", text:"missing token"});
                node.error("Token není k dispozici.", msg);
                if (done) done("Token není k dispozici.");
                return;
            }
            node.status({fill:"blue", shape:"dot", text:"Načítám přítomné"});
            try {
                const apiUrl = node.configNode.apiUrl;
                const { data: persons } = await axios.get(
                    `${apiUrl}/HwStructure/getAllPersonWithCurrentAccess`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                let posledni = null;
                if (Array.isArray(persons) && persons.length > 0) {
                    posledni = persons.reduce((a, b) =>
                        (a.arrivalTime > b.arrivalTime ? a : b)
                    );
                }
                send([
                    { payload: posledni ? `${posledni.firstName} ${posledni.lastName}` : null },
                    { payload: posledni ? posledni.personId : null },
                    { payload: posledni ? posledni.login : null },
                    { payload: persons }
                ]);
                node.status({fill:"green", shape:"dot", text:"Přítomní načteni"});
                if (done) done();
            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"chyba API"});
                node.error("Chyba při čtení přítomných: " + err.message, msg);
                if (done) done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-presence", AktionCloudPresenceNode);
};
