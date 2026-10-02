import $ from 'jquery'
import RED from 'node-red'
import * as api from '../api.js'
import * as events from '../events.js'

const connectionStatusTemplate = `<button class="red-ui-footer-button" style="width: auto;">
    <span class="ff-remote-agent-connection-status">
        <span class="flowfuse-remote-agent-icon" style="margin-right: 5px;"></span>
        <span class="ff-remote-agent-connection-status-connected">
            <i class="fa fa-circle"></i> <span class="ff-remote-agent-connection-status-device-name"></span>
        </span>
        <span class="ff-remote-agent-connection-status-connecting">
            <i class="fa fa-circle"></i> connecting...
        </span>
        <span class="ff-remote-agent-connection-status-registering">
            <i class="fa fa-circle"></i> registering...
        </span>
        <span class="ff-remote-agent-connection-status-disconnected">
            <i class="fa fa-circle-o"></i> not connected
        </span>
        <span class="ff-remote-agent-connection-status-unregistered">
            Connect to FlowFuse
        </span>
    </span>
</button>`

export function ConnectionStatusWidget () {
    const statusWidget = $(connectionStatusTemplate)
    statusWidget.on('click', function (evt) {
        RED.userSettings.show('flowfuse-remote-agent')
    })
    // RED.popover.create({
    //     tooltip: true,
    //     target: statusWidget.find('.ff-remote-agent-connection-status-username'),
    //     trigger: 'hover',
    //     size: 'small',
    //     direction: 'top',
    //     content: function () {
    //         const settings = api.getSettings()
    //         return $(`<div style="padding: 5px"><img src="${settings.user.avatar}" width="24px" style="margin-right: 5px;"> <span>${settings.user.name}</div>`)
    //     },
    //     delay: { show: 250, hide: 50 }
    // })

    function refreshConnectionState (state) {
        statusWidget.find('.ff-remote-agent-connection-status-connected').toggle(state === 'connected')
        statusWidget.find('.ff-remote-agent-connection-status-registering').toggle(state === 'registering')
        statusWidget.find('.ff-remote-agent-connection-status-disconnected').toggle(state === 'disconnected')
        statusWidget.find('.ff-remote-agent-connection-status-unregistered').toggle(state === 'unconfigured')
        statusWidget.find('.ff-remote-agent-connection-status-connecting').toggle(state === 'connecting')
        if (state === 'connected') {
            statusWidget.find('.ff-remote-agent-connection-status-device-name').text(api.getSetting('name'))
        }
    }

    events.on('connection-state', function (state) {
        refreshConnectionState(state)
    })
    refreshConnectionState('')
    return statusWidget
}
