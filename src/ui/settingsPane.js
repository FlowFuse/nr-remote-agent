// Import the globals
import $ from 'jquery'
import RED from 'node-red'
import { connect, disconnect, getSettings, getState, cancelConnect } from './api.js'
import * as events from './events.js'

let settingsPane

function init () {
    RED.userSettings.add({
        id: 'flowfuse-remote-agent',
        title: 'FlowFuse Remote Agent',
        get: getSettingsPane,
        close: function () {
            events.off('settings', refreshContent)
            events.off('connection-state', refreshContent)
        }
    })
}
const settingsTemplate = `
<div id="red-ui-settings-tab-flowfuse-remote-agent" class="red-ui-help ff-remote-agent-settings">
    <h3>Platform Details</h3>
    <div class="red-ui-settings-row">
        <label>Server</label>
        <div style="display: inline-flex">
            <input type="text" id="flowfuse-remote-agent-settings-forgeURL" style="flex-grow: 1; margin-right: 10px;">
            <button type="button" class="red-ui-button" id="flowfuse-remote-agent-settings-connection" style="min-width: 80px">disconnect</button>
        </div>
    </div>
    <div id="ff-remote-agent-device-details" class="red-ui-settings-row"></div>
</div>`

function refreshContent () {
    const settings = getSettings()
    const state = getState()

    // Connection State
    if (state === 'unconfigured') {
        settingsPane.find('#flowfuse-remote-agent-settings-connection').text('Connect').attr('disabled', false)
        settingsPane.find('#flowfuse-remote-agent-settings-forgeURL').attr('disabled', false)
    } else if (state === 'registering') {
        settingsPane.find('#flowfuse-remote-agent-settings-connection').html('<img style="height: 20px;" src="red/images/spin.svg" alt=""/>').attr('disabled', true)
        settingsPane.find('#flowfuse-remote-agent-settings-forgeURL').attr('disabled', true)
        // settingsPane.find('#flowfuse-remote-agent-settings-connection').text('Cancel').attr('disabled', false)
        // settingsPane.find('#flowfuse-remote-agent-settings-forgeURL').attr('disabled', true)
    } else {
        settingsPane.find('#flowfuse-remote-agent-settings-connection').text('Disconnect').attr('disabled', false)
        settingsPane.find('#flowfuse-remote-agent-settings-forgeURL').attr('disabled', true)
    }

    // Device Panel
    const paneContent = settingsPane.find('#ff-remote-agent-device-details')
    paneContent.empty()
    if (settings.deviceId) {
        const table = $('<table class="red-ui-info-table" style="border: 1px solid var(--red-ui-secondary-border-color);"></table>').appendTo(paneContent)
        const tableBody = $('<tbody>').appendTo(table)

        let propRow = $('<tr class="red-ui-help-info-row"><td>Team</td><td></td></tr>').appendTo(tableBody)
        const propCell = $(propRow.children()[1])

        $('<img>').attr('src', settings.team?.avatar).css({ width: '20px', height: '20px', 'border-radius': '50%', 'margin-right': '5px' }).appendTo(propCell)
        $('<span>').text(settings.team?.name).appendTo(propCell)

        propRow = $('<tr class="red-ui-help-info-row"><td>Name</td><td></td></tr>').appendTo(tableBody)
        $(propRow.children()[1]).text(settings.name)

        propRow = $('<tr class="red-ui-help-info-row"><td>Connection</td><td></td></tr>').appendTo(tableBody)
        $(propRow.children()[1]).text(getState())
    }
}

function getSettingsPane () {
    settingsPane = $(settingsTemplate)
    const settings = getSettings()

    events.on('settings', refreshContent)
    events.on('connection-state', refreshContent)

    settingsPane.find('#flowfuse-remote-agent-settings-forgeURL').val(settings.forgeURL || 'https://app.flowfuse.com')

    settingsPane.find('#flowfuse-remote-agent-settings-connection').on('click', function (evt) {
        const state = getState()
        if (state === 'registering') {
            // We currently disable the button when registering, but if we ever enable it, clicking it will cancel the registration
            cancelConnect()
            return
        }
        if (state === 'unconfigured') {
            const url = settingsPane.find('#flowfuse-remote-agent-settings-forgeURL').val()
            connect(url)
            return
        }
        // In a connected state. Clicking the button will disconnect the agent - need to confirm with the user first
        const notification = RED.notify(`<p>Are you sure you want to disconnect the FlowFuse Remote Agent?</p>
                                         <p>You will not be able to reconnect as the same instance and will need to reregister as a new instance to reconnect.</p>`, {
            type: 'warning',
            modal: true,
            fixed: true,
            buttons: [
                {
                    text: 'Disconnect',
                    class: 'primary',
                    click: function () {
                        notification.close()
                        disconnect()
                        RED.notify('FlowFuse Remote Agent disconnected', 'success')
                    }
                },
                {
                    text: 'Cancel',
                    click: function () {
                        // Do nothing
                        notification.close()
                    }
                }
            ]
        })
    })
    refreshContent()
    return settingsPane
}

export {
    init
}
