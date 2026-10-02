import $ from 'jquery'
import RED from 'node-red'
import * as events from './events.js'

let settings = { }
let currentState = null

export async function setState (state) {
    currentState = state
    await refreshSettings()
    events.emit('connection-state', currentState)
}

export function getState () {
    return currentState
}

export async function refreshSettings () {
    try {
        settings = await $.ajax({
            url: 'flowfuse-remote-agent/settings/',
            type: 'GET'
        })
        events.emit('settings', settings)
    } catch (err) {
        settings = { }
    }
}

let registrationInProgress = false

export function connect (forgeURL, done) {
    forgeURL = forgeURL || settings.forgeURL
    if (!forgeURL) {
        RED.notify('Please provide a FlowFuse Server URL', 'error')
        return
    }
    if (registrationInProgress) {
        return
    }
    registrationInProgress = true
    $.ajax({
        contentType: 'application/json',
        url: 'flowfuse-remote-agent/auth/start',
        method: 'POST',
        data: JSON.stringify({
            forgeURL
        })
    }).then(data => {
        if (data.registerUrl) {
            // Open the registration URL in a new window for the user to complete the OAuth flow
            const popup = window.open(data.registerUrl, 'FlowFuseNodeREDPluginAuthWindow', 'menubar=no,location=no,toolbar=no,chrome,height=650,width=700')
            const checkPopupClosed = setInterval(async () => {
                if (popup.closed) {
                    clearInterval(checkPopupClosed)
                    registrationInProgress = false
                    setTimeout(async () => {
                        if (!settings.deviceId) {
                            // Async registration has not completed, but the window is closed
                            // Cancel the registration
                            cancelConnect()
                        }
                    }, 2000)
                }
            }, 1000)
        } else if (data && data.error) {
            RED.notify(`Failed to connect to server: ${data.error}`, { type: 'error' })
        }
    }).catch(err => {
        registrationInProgress = false
        console.error(err)
    })
}

export async function cancelConnect () {
    await $.ajax({
        contentType: 'application/json',
        url: 'flowfuse-remote-agent/auth/start',
        method: 'DELETE'
    })
}

export function disconnect () {
    $.post('flowfuse-remote-agent/auth/disconnect').then(data => {
        refreshSettings()
    })
}

export function getSettings () {
    return settings
}

export function getSetting (key) {
    return settings[key]
}
