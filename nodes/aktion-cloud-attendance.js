const axios = require("axios");

module.exports = function(RED) {
    function AktionCloudAttendanceNode(config) {
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
            node.status({fill:"blue", shape:"dot", text:"Zápis docházky"});
            try {
                const apiUrl = node.configNode.apiUrl;
                const attendancePayload = {
                    personId: msg.personId || config.personId,
                    direction: msg.direction || config.direction, // "in" nebo "out"
                    time: msg.time || new Date().toISOString(),
                    type: msg.type || config.type
                };
                const { data: result } = await axios.post(
                    `${apiUrl}/Attendance/create`,
                    attendancePayload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                send([
                    { payload: result.status },
                    { payload: attendancePayload.personId },
                    { payload: attendancePayload.type },
                    { payload: result }
                ]);
                node.status({fill:"green", shape:"dot", text:"Docházka zapsána"});
                if (done) done();
            } catch (err) {
                node.status({fill:"red", shape:"ring", text:"chyba zápisu"});
                node.error("Chyba zápisu do Aktion Cloud API: " + err.message, msg);
                if (done) done(err);
            }
        });
    }
    RED.nodes.registerType("aktion-cloud-attendance", AktionCloudAttendanceNode);
};
