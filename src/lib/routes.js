const settings = require('./settings')
const { ffGet, ffPost } = require('./httpClient')

function setupRoutes (RED, agent) {
    // auth.setupRoutes(RED)

    let registrationInProgress = null

    RED.httpAdmin.get('/flowfuse-remote-agent/settings', async (request, response) => {
        const body = settings.exportPublicSettings()
        response.send(body)
    })
    RED.httpAdmin.post('/flowfuse-remote-agent/auth/start', async (request, response) => {
        // TODO: only if the agent isn't already registered
        if (settings.get('deviceId')) {
            return response.status(400).send({ error: 'Already registered', code: 'already_registered' })
        }
        if (request.body.forgeURL) {
            request.body.forgeURL = request.body.forgeURL.replace(/\/$/, '')
            // forgeURL is stored in settings so that the agent can use it for future requests - without trailing /
            settings.set('forgeURL', request.body.forgeURL)
        }
        if (registrationInProgress) {
            // Already trying to register. Abort the previous registration attempt and start a new one.
            return response.status(400).send({ error: 'Registration already in progress', code: 'registration_in_progress' })
        }

        const forgeURL = settings.get('forgeURL')
        RED.comms.publish('flowfuse-remote-agent/state', { state: 'registering' }, true)
        agent.log(`Starting registration process with FlowFuse ${forgeURL}`)

        try {
            // Get the registration URL
            const registrationResponse = await ffPost('/api/v1/devices/_/register', { type: 'lite' })
            const { registerUrl, doneUrl } = await registrationResponse.body.json()
            // Send the registration URL back to the client so it can open it - do not expose doneUrl
            response.send({ registerUrl: forgeURL + registerUrl })
            // Start polling the doneUrl for completion
            registrationInProgress = new AbortController()
            let result
            try {
                result = await pollDoneUrl(doneUrl.replace(/^\//, ''), 5000, registrationInProgress.signal)
            } catch (err) {
                if (err.name === 'AbortError') {
                    RED.comms.publish('flowfuse-remote-agent/state', { state: 'unconfigured' }, true)
                    // Polling was cancelled - nothing more to do here
                    registrationInProgress = null
                    return
                }
            } finally {
                if (registrationInProgress) {
                    registrationInProgress.abort()
                    registrationInProgress = null
                }
            }

            if (result && result.otc) {
                agent.register(result.otc)
            } else {
                RED.comms.publish('flowfuse-remote-agent/state', { state: 'unconfigured' }, true)
            }
        } catch (err) {
            if (err.cause) {
                agent.warn(`Registration error: ${err.cause.toString()}`)
            } else if (err.errors && Array.isArray(err.errors)) {
                for (const e in err.errors) {
                    agent.warn(`Registration error: ${err.errors[e].toString()}`)
                }
            } else {
                agent.warn(`Registration error: ${err.toString()}`)
            }
            RED.comms.publish('flowfuse-remote-agent/state', { state: 'unconfigured' }, true)
            response.status(400).send({ error: 'Failed to start registration', code: 'registration_failed' })
        }
    })

    RED.httpAdmin.post('/flowfuse-remote-agent/auth/disconnect', async (request, response) => {
        // Clear the connection state and settings
        agent.unregister()
    })

    RED.httpAdmin.delete('/flowfuse-remote-agent/auth/start', async (request, response) => {
        // Called if the popup window is closed before the registration is complete. This will abort the polling of the doneUrl.
        if (registrationInProgress) {
            registrationInProgress.abort()
            registrationInProgress = null
        }
        response.send({})
    })

    /**
     * Poll the given doneUrl until we get a 200 response, or throw an error if we get a 404.
     * The polling will continue until the provided AbortSignal is aborted, at which point an AbortError will be thrown.
     * @param {string} doneUrl The URL to poll.
     * @param {number} interval The polling interval in milliseconds.
     * @param {AbortSignal} signal The signal to monitor to abort the polling.
     * @returns {Promise<Object>} The parsed JSON response from the doneUrl when it returns a 200 status code.
     */
    async function pollDoneUrl (doneUrl, interval = 5000, signal) {
        agent.log('Waiting for registration to complete...')
        while (true) {
            // Throws an AbortError if the signal has been aborted, so the
            // caller can distinguish cancellation from a completed poll.
            signal?.throwIfAborted()
            try {
                const response = await ffGet(doneUrl)
                if (response.statusCode === 200) {
                    return response.body.json()
                } else if (response.statusCode === 404) {
                    agent.warn('Registration not found - aborting')
                    return
                }
            } catch (err) {
                if (err.response?.statusCode === 404) {
                    agent.warn('Registration not found - aborting')
                    return
                }
                // ignore errors and retry
            }
            // Wait for the interval, but wake early if the signal is aborted.
            // The throwIfAborted() at the top of the loop then handles the exit.
            await new Promise(resolve => {
                if (signal?.aborted) {
                    resolve()
                    return
                }
                const timer = setTimeout(() => {
                    signal?.removeEventListener('abort', onAbort)
                    resolve()
                }, interval)
                const onAbort = () => {
                    clearTimeout(timer)
                    resolve()
                }
                signal?.addEventListener('abort', onAbort, { once: true })
            })
        }
    }
}

module.exports = {
    setupRoutes
}
