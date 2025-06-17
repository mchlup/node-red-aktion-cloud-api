module.exports = function(RED) {
    function AktionCloudConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.email = config.email;
        this.apiKey = config.apiKey;
        this.apiUrl = config.apiUrl || "https://api.aktion.cloud";
    }
    RED.nodes.registerType("aktion-cloud-config", AktionCloudConfigNode, {
        credentials: {
            email: {type:"text"},
            apiKey: {type:"password"}
        }
    });
};
