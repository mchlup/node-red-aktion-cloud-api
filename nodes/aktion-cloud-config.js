module.exports = function(RED) {
    function AktionCloudConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.email = this.credentials && this.credentials.email;
        this.apiKey = this.credentials && this.credentials.apiKey;
        this.apiUrl = config.apiUrl || "https://cloud.aktion.cz/api";
    }
    RED.nodes.registerType("aktion-cloud-config", AktionCloudConfigNode, {
        credentials: {
            email: { type: "text" },
            apiKey: { type: "password" }
        }
    });
};
