const axios = require('axios');

module.exports = function(RED) {
    function AktionCloudAttendanceNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.aktionCloudConfig = RED.nodes.getNode(config.aktionCloud);

        node.on('input', async function(msg, send, done) {
            node.status({fill: "blue", shape: "dot", text: "Zápis docházky..."});

            const apiUrl = (node.aktionCloudConfig && node.aktionCloudConfig.apiUrl) || "https://cloud.aktion.cz/api";
            const token = msg.token;
            if (!token) {
                node.status({fill: "red", shape: "ring", text: "Chybí token"});
                done("Token není k dispozici.");
                return;
            }

            let attendancePayload = {
                personId: msg.personId || config.personId || "",
                direction: msg.direction || config.direction || "in",
                time: msg.time || new Date().toISOString(),
                type: msg.type || config.type || ""
            };

            try {
                let person = attendancePayload.personId;
                if (!person) {
                    node.status({fill: "red", shape: "ring", text: "Chybí osoba"});
                    done("Není zadán uživatel.");
                    return;
                }

                if (typeof person === 'string' && !/^\d+$/.test(person)) {
                    const resp = await axios.get(`${apiUrl}/Person/getAll`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const allPersons = resp.data;
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
                    attendancePayload.personId = Number(person);
                }

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

                const result = response.data;

                node.status({fill: "green", shape: "dot", text: "Docházka zapsána"});

                send([
                    { payload: result.status || "OK" },
                    { payload: attendancePayload.personId },
                    { payload: attendancePayload.type },
                    { payload: result }
                ]);
                done();
            } catch (err) {
                node.status({fill: "red", shape: "ring", text: "Chyba zápisu"});
                send([
                    { payload: err.message || "Chyba" },
                    null,
                    null,
                    null
                ]);
                done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-attendance", AktionCloudAttendanceNode);
};
