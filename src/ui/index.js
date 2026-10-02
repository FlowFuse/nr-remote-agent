// Import the css so it gets included in the output
// eslint-disable-next-line no-unused-vars
import style from './style.css'

// Import the globals
// import $ from 'jquery'
import RED from 'node-red'
import * as settingsPane from './settingsPane.js'
import { setState, getState } from './api'

import { ConnectionStatusWidget } from './components/connectionStatus.js'

RED.plugins.registerPlugin('flowfuse-remote-agent', {
    onadd: async function () {
        settingsPane.init()
        const statusBarWidget = ConnectionStatusWidget()
        RED.statusBar.add({
            id: 'ff-remote-agent-status',
            align: 'right',
            element: statusBarWidget
        })

        // Do this last, so that the plugin is fully initialized before we try to refresh the settings
        RED.comms.subscribe('flowfuse-remote-agent/connected', async function (topic, msg) {
            // Comms connection has been established, so refresh the settings to get the latest state from the server

            // Trigger connection-state event to update the UI
            setState(getState())
        })
        RED.comms.subscribe('flowfuse-remote-agent/state', async function (topic, msg) {
            setState(msg.state)
        })
    }
})
