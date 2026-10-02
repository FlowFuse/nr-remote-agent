const DEFAULTS = {
    forgeURL: 'https://app.flowfuse.com'
}
let settings = {
    forgeURL: 'https://app.flowfuse.com'
}
let RED
function init (red) {
    RED = red
    const existingSettings = RED.settings.get('flowfuse-remote-agent')
    if (existingSettings) {
        Object.assign(settings, existingSettings)
    }
}

const get = key => settings[key]
const set = (key, value) => {
    if (key === 'forgeURL') {
        if (value && !/^https?:\/\//i.test(value)) {
            value = `https://${value}`
        }
    }
    settings[key] = value
    RED.settings.set('flowfuse-remote-agent', settings)
}
// For now, export all settings, but in the future we may want to only export a subset of them
const exportPublicSettings = () => {
    const publicSettings = {}
    // Filter the settings for only the keys that we want to export to the UI
    ;['forgeURL', 'deviceId', 'name', 'team', 'application', 'user'].forEach(key => {
        publicSettings[key] = settings[key]
    })
    return publicSettings
}
const reset = () => {
    const newSettings = {}
    newSettings.forgeURL = settings.forgeURL || DEFAULTS.forgeURL
    settings = newSettings
    RED.settings.set('flowfuse-remote-agent', settings)
}

module.exports = {
    init,
    get,
    set,
    reset,
    exportPublicSettings
}
