const undici = require('undici')
const settings = require('./settings')

function joinURL (base, path) {
    if (base.endsWith('/')) {
        base = base.slice(0, -1)
    }
    if (!path.startsWith('/')) {
        path = '/' + path
    }
    return base + path
}

async function ffGet (url, opts) {
    opts = {
        ...opts,
        method: 'GET'
    }
    opts.headers = {
        ...opts.headers,
        'User-Agent': 'FlowFuse Remote Agent'
    }
    return undici.request(
        joinURL(settings.get('forgeURL'), url),
        opts
    )
}

async function ffPost (url, payload, opts) {
    opts = {
        ...opts,
        method: 'POST',
        body: JSON.stringify(payload)
    }
    opts.headers = {
        ...opts.headers,
        'Content-Type': 'application/json',
        'User-Agent': 'FlowFuse Remote Agent'
    }
    return undici.request(
        joinURL(settings.get('forgeURL'), url),
        opts
    )
}

module.exports = {
    ffGet,
    ffPost
}
