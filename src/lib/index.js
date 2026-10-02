const settings = require('./settings')
const { Agent } = require('./agent')
const { setupRoutes } = require('./routes')

module.exports = (RED) => {
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
