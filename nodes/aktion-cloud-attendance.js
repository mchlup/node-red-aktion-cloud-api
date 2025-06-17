const axios = require('axios');

module.exports = function(RED) {
    function AktionCloudAttendanceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Získání reference na konfigurační node s credentials
        node.aktionCloudConfig = RED.nodes.getNode(config.aktionCloud);

        node.on('input', async function(msg, send, done) {
            node.status({fill: "blue", shape: "dot", text: "Zápis docházky..."});

            // API údaje z config nodu
            const apiUrl = (node.aktionCloudConfig && node.aktionCloudConfig.apiUrl) || "https://api.aktion.cloud";
            const token = msg.token;
            if (!token) {
                node.status({fill: "red", shape: "ring", text: "Chybí token"});
                done("Token není k dispozici.");
                return;
            }

            // Sestavení payloadu z msg/config
            let attendancePayload = {
                personId: msg.personId || config.personId || "",
                direction: msg.direction || config.direction || "in", // "in" nebo "out"
                time: msg.time || new Date().toISOString(), // ISO string
                type: msg.type || config.type || ""
            };

            try {
                let person = attendancePayload.personId;
                // Pokud není zadáno, chyba:
                if (!person) {
                    node.status({fill: "red", shape: "ring", text: "Chybí osoba"});
                    done("Není zadán uživatel.");
                    return;
                }

                // Pokud je person string a ne jen čísla, hledáme podle loginu nebo e-mailu
                if (typeof person === 'string' && !/^\d+$/.test(person)) {
                    // Volání na získání seznamu všech osob
                    const resp = await axios.get(`${apiUrl}/Person/getAll`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const allPersons = resp.data;

                    // Najít uživatele podle loginu nebo e-mailu (login je např. "jmeno.prijmeni")
                    const found = allPersons.find(p =>
                        (p.login && p.login.toLowerCase() === person.toLowerCase())
                        || (p.email && p.email.toLowerCase() === person.toLowerCase())
                    );
                    if (!found) {
                        node.status({fill: "red", shape: "ring", text: "Uživatel nenalezen"});
                        done("Uživatel s loginem/e-mailem nenalezen.");
                        return;
                    }
                    attendancePayload.personId = found.personId;
                } else {
                    // Je to číslo, jen převedeme na Number
                    attendancePayload.personId = Number(person);
                }

                // Volání API pro zápis docházky
                // API endpoint podle dokumentace může být "Attendance/create" nebo "Attendance/setPass" (ověřte podle své verze API)
                const response = await axios.post(
                    `${apiUrl}/Attendance/create`,
                    {
                        personId: attendancePayload.personId,
                        direction: attendancePayload.direction,
                        time: attendancePayload.time,
                        type: attendancePayload.type
                    },
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                // Výstupy: [Stav/zpráva, ID uživatele, Typ akce, Celý JSON]
                const result = response.data;

                node.status({fill: "green", shape: "dot", text: "Docházka zapsána"});

                send([
                    { payload: result.status || "OK" },                      // Výstup 1: stav / zpráva
                    { payload: attendancePayload.personId },                 // Výstup 2: ID uživatele
                    { payload: attendancePayload.type },                     // Výstup 3: typ akce
                    { payload: result }                                      // Výstup 4: kompletní JSON odpověď
                ]);
                done();
            } catch (err) {
                node.status({fill: "red", shape: "ring", text: "Chyba zápisu"});
                send([
                    { payload: err.message || "Chyba" }, // Výstup 1: chyba
                    null,                                // Výstup 2
                    null,                                // Výstup 3
                    null                                 // Výstup 4
                ]);
                done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-attendance", AktionCloudAttendanceNode);
};
