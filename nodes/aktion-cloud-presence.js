const axios = require('axios');

module.exports = function(RED) {
    function AktionCloudPresenceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.aktionCloudConfig = RED.nodes.getNode(config.aktionCloud);

        node.on('input', async function(msg, send, done) {
            // Kontrola, zda je vybrána konfigurace připojení
            if (!node.aktionCloudConfig) {
                node.status({fill: "red", shape: "ring", text: "Chybí připojení"});
                return done("Není zadána konfigurace připojení.");
            }
            node.status({fill: "blue", shape: "dot", text: "Načítám přítomné..."});

            const apiUrl = (node.aktionCloudConfig && node.aktionCloudConfig.apiUrl) || "https://cloud.aktion.cz/api";
            const token = msg.token;
            if (!token) {
                node.status({fill: "red", shape: "ring", text: "Chybí token"});
                return done("Token není k dispozici.");
            }
            try {
                const response = await axios.get(
                    `${apiUrl}/HwStructure/getAllPersonWithCurrentAccess`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const persons = response.data || [];

                let posledni = null;
                if (persons.length > 0) {
                    // Najít osobu s nejnovějším časem příchodu
                    posledni = persons.reduce((a, b) => {
                        if (a.arrivalTime && b.arrivalTime) {
                            return new Date(a.arrivalTime) > new Date(b.arrivalTime) ? a : b;
                        }
                        return a;
                    });
                }

                // Odeslat výstupy:
                // 1) Jméno posledního přítomného
                // 2) ID posledního přítomného
                // 3) Login posledního přítomného
                // 4) Celý seznam přítomných osob (JSON pole)
                send([
                    { payload: posledni ? `${(posledni.firstName || "")} ${(posledni.lastName || "")}`.trim() : null },
                    { payload: posledni ? posledni.personId : null },
                    { payload: posledni ? posledni.login : null },
                    { payload: persons }
                ]);
                node.status({fill: "green", shape: "dot", text: "Přítomní načteni"});
                done();
            } catch (err) {
                node.status({fill: "red", shape: "ring", text: "Chyba načtení"});
                // V případě chyby pošleme chybovou zprávu na první výstup, ostatní výstupy null
                send([{ payload: err.message }, null, null, null]);
                done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-presence", AktionCloudPresenceNode);
};
