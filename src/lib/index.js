const settings = require('./settings')
const { Agent } = require('./agent')
const { setupRoutes } = require('./routes')

module.exports = (RED) => {
    // Check if we are running in a fully managed FlowFuse Instance
    //  - if so, throw an error as this plugin is for unmanaged instances
    const teamId = RED.settings.flowforge?.teamID
    const instanceId = RED.settings.flowforge?.instanceID ||
                       RED.settings.flowforge?.projectID ||
                       RED.settings.flowforge?.deviceId ||
                       ''
    if (teamId && instanceId) {
        RED.log.error('FlowFuse Remote Agent cannot be loaded in a fully managed FlowFuse environment')
        throw new Error('FlowFuse Remote Agent cannot be loaded in a fully managed FlowFuse environment')
    }

    RED.plugins.registerPlugin('flowfuse-remote-agent', {
        settings: {
            '*': { exportable: true }
        },
        onadd: function () {
            settings.init(RED)
            const agent = new Agent(RED)
            setupRoutes(RED, agent)
            // This is a bit of a hack, but it lets the plugin know when the
            // comms connection has been established - such as after a runtime
            // restart
            RED.comms.publish('flowfuse-remote-agent/connected', true, true)
        }
    })
}
