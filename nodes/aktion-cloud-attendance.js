module.exports = function(RED) {
    const axios = require('axios');
    const TOKEN_EXPIRY = 15000;
    const MAX_RETRIES = 3;

    function AktionCloudAttendanceNode(config) {
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
                const response = await axios.post(`${apiUrl}/login`, { email: email, apiKey: apiKey }, { timeout: 5000 });
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
            node.status({ fill: "blue", shape: "dot", text: "Zápis docházky..." });
            let token = msg.token || (msg.payload && msg.payload.token);
            if (!token) {
                if (!email || !apiKey) {
                    node.status({ fill: "red", shape: "ring", text: "Chybí e-mail nebo API klíč" });
                    return done("Není k dispozici token ani přihlašovací údaje.");
                }
                token = await getToken();
            }
            try {
                const authHeader = { headers: { Authorization: `Bearer ${token}` } };
                let attendancePayload = {
                    personId: msg.personId || config.personId || "",
                    direction: msg.direction || config.direction || "in",
                    time: msg.time || new Date().toISOString(),
                    type: msg.type || config.type || ""
                };
                let person = attendancePayload.personId;
                if (!person) {
                    node.status({ fill: "red", shape: "ring", text: "Chybí osoba" });
                    return done("Není zadán uživatel.");
                }
                if (typeof person === 'string' && !/^\d+$/.test(person)) {
                    const resp = await axios.get(`${apiUrl}/Person/getAll`, authHeader);
                    const allPersons = resp.data;
                    const found = allPersons.find(p =>
                        (p.login && p.login.toLowerCase() === person.toLowerCase()) ||
                        (p.email && p.email.toLowerCase() === person.toLowerCase())
                    );
                    if (!found) {
                        node.status({ fill: "red", shape: "ring", text: "Uživatel nenalezen" });
                        return done("Uživatel s loginem/e-mailem nenalezen.");
                    }
                    attendancePayload.personId = found.personId;
                } else {
                    attendancePayload.personId = Number(person);
                }
                const response = await axios.post(`${apiUrl}/Attendance/create`, {
                    personId: attendancePayload.personId,
                    direction: attendancePayload.direction,
                    time: attendancePayload.time,
                    type: attendancePayload.type
                }, authHeader);
                const result = response.data;
                node.status({ fill: "green", shape: "dot", text: "Docházka zapsána" });
                send([
                    { payload: result.status || "OK" },
                    { payload: attendancePayload.personId },
                    { payload: attendancePayload.type },
                    { payload: result }
                ]);
                done();
            } catch (err) {
                node.status({ fill: "red", shape: "ring", text: "Chyba zápisu" });
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
