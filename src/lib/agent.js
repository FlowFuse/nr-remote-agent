const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { ffPost } = require('./httpClient')
const { LogHandler } = require('./log/LogHandler')
const { MqttAgentClient } = require('./mqttClient')
const settings = require('./settings')

/**
 * Compare two values, treating null and undefined as equivalent.
 * @returns {boolean} true if the values are different
 */
function isDifferent (a, b) {
    return (a ?? null) !== (b ?? null)
}

class Agent {
    constructor (RED) {
        this.RED = RED
        // Work out our state.
        // 1. 'unconfigured' no configuration; the user hasn't connected us yet
        // 2. 'disconnected' - configured but not connected
        // 3. 'connected' - configured and connected
        this.state = 'unconfigured'

        this.refreshState()

        if (!this.deviceId) {
            this.state = 'unconfigured'
            RED.comms.publish('flowfuse-remote-agent/state', { state: 'unconfigured' }, true)
        } else {
            this.state = 'disconnected'
            RED.comms.publish('flowfuse-remote-agent/state', { state: 'disconnected' }, true)
            this.start()
        }
        this.logHandler = new LogHandler(RED, this)
        this.version = require('../../package.json').version
    }

    async refreshState () {
        // Refresh state from settings. This happens in two cases:
        // - after initial registration
        // - on load
        this.deviceId = settings.get('deviceId')
        this.teamId = settings.get('team')?.id
        this.currentSnapshot = settings.get('snapshot')
        this.currentSettings = settings.get('settings')
        this.currentProject = settings.get('project')
        this.currentApplication = settings.get('application')
        this.currentMode = settings.get('mode') || 'developer'
        this.currentOwnerType = this.currentApplication ? 'application' : this.currentProject ? 'project' : null
        this.currentState = 'running'
        this.targetState = settings.get('targetState') || 'running'
        this.licensed = settings.get('licensed') || false

        // forgeUrl is prepended by the httpClient module, so we don't need to store it here
        this.auditUrl = `/logging/device/${this.deviceId}/audit`
    }

    async start () {
        this.startTime = Date.now()
        // Start the agent's main worker to keep the connection to the server
        this.mqttClient = new MqttAgentClient(this.RED, this)
        this.mqttClient.connect()
    }

    getState () {
        const state = {
            ownerType: this.currentOwnerType,
            project: this.currentProject || null,
            application: this.currentApplication?.id || null,
            snapshot: this.currentSnapshot?.id || null,
            settings: this.currentSettings || null,
            state: this.currentState,
            mode: this.currentMode,
            targetState: this.targetState,
            health: {
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                snapshotRestartCount: this.launcher?.restartCount || 0
            },
            agentVersion: this.version,
            licensed: this.licensed,
            nodejsVersion: process.version,
            nodeRedVersion: this.RED.version()
        }

        return state
    }

    handleUpdateCommand (command) {
        this.debug('Handle Update Command')
        this.debug(JSON.stringify(command))
        if (isDifferent(command.ownerType, this.currentOwnerType)) {
            this.debug(` - ownerType mismatch ${command.ownerType} !== ${this.currentOwnerType}`)
        }
        if (isDifferent(command.application, this.currentApplication?.id)) {
            this.debug(` - application mismatch ${command.application} !== ${this.currentApplication?.id}`)
        }
        if (isDifferent(command.project, this.currentProject?.id)) {
            this.debug(` - project mismatch ${command.project} !== ${this.currentProject?.id}`)
        }
        if (isDifferent(command.snapshot, this.currentSnapshot?.id)) {
            this.debug(` - snapshot mismatch ${command.snapshot} !== ${this.currentSnapshot?.id}`)
        }
        if (isDifferent(command.mode, this.currentMode)) {
            this.debug(` - mode mismatch ${command.mode} !== ${this.currentMode}`)
            settings.set('mode', command.mode)
            this.currentMode = command.mode
        }
        if (isDifferent(command.licensed, this.licensed)) {
            this.debug(` - licensed mismatch ${command.licensed} !== ${this.licensed}`)
            settings.set('licensed', command.licensed)
            this.licensed = command.licensed
        }
        if (isDifferent(command.settings, this.currentSettings)) {
            this.debug(` - settings mismatch ${command.settings} !== ${this.currentSettings}`)
            settings.set('settings', command.settings)
            this.currentSettings = command.settings
        }
        // if (command.snapshot) {
        //     settings.set('snapshot', command.snapshot)
        //     this.currentSnapshot = command.snapshot
        // }
    }

    startLogStream () {
        this.logHandler.enable()
    }

    stopLogStream () {
        this.logHandler.disable()
    }

    async register (otc) {
        if (this.state !== 'unconfigured') {
            throw new Error('Agent is already registered')
        }
        const token = Buffer.from(otc).toString('base64')

        const {
            statusCode,
            body
        } = await ffPost('/api/v1/devices/', {
            setup: true,
            agentHost: os.hostname()
        }, {
            headers: {
                authorization: `Bearer ${token}`
            },
            timeout: {
                request: 10000
            }
        }
        )
        const response = await body.json()
        if (statusCode === 200) {
            this.log('Agent registered successfully')
            this.log(` - team: ${response.team?.name} (${response.team?.id})`)
            this.log(` - instance: ${response.name} (${response.id})`)
            settings.set('deviceId', response.id)
            settings.set('credentials', response.credentials)
            settings.set('team', response.team)
            settings.set('application', response.application)
            settings.set('ownerType', response.ownerType)
            settings.set('name', response.name)
            this.state = 'disconnected'
            this.refreshState()
            this.start()
        }
    }

    async unregister () {
        this.log('Unregistering agent')
        this.logHandler.disable()
        this.mqttClient?.disconnect()
        this.mqttClient = null
        settings.reset()
        this.state = 'unconfigured'
        this.refreshState()
        this.RED.comms.publish('flowfuse-remote-agent/state', { state: 'unconfigured' }, true)
    }

    async sendAuditEvent (msg) {
        const token = settings.get('credentials')?.token
        if (token) {
            try {
                this.debug(`Sending audit event ${JSON.stringify(msg)}`)
                await ffPost(
                    this.auditUrl,
                    msg,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                )
            } catch (err) {
                this.error(`Failed to send audit event: ${err.toString()}`)
            }
        }
    }

    async generateSnapshot () {
        const flows = []
        const credentials = {}
        this.RED.nodes.eachNode(n => {
            flows.push({ ...n })
            const nodeCreds = this.RED.nodes.getCredentials(n.id)
            if (nodeCreds) {
                credentials[n.id] = nodeCreds
            }
        })
        const userPackage = path.join(this.RED.settings.userDir, 'package.json')
        let packageContent = null
        try {
            const packageData = await fs.readFile(userPackage, 'utf-8')
            const packageJson = JSON.parse(packageData)
            if (packageJson.dependencies) {
                packageContent = {
                    modules: packageJson.dependencies
                }
            }
        } catch (err) {
            this.warn(`Failed to read ${userPackage}: ${err.toString()}`)
        }

        const snapshot = {
            package: packageContent,
            flows,
            credentials
        }
        return snapshot
    }

    log (message) {
        this.RED.log.info(`[flowfuse-remote-agent] ${message}`)
    }

    debug (message) {
        this.RED.log.debug(`[flowfuse-remote-agent] ${message}`)
    }

    error (message) {
        this.RED.log.error(`[flowfuse-remote-agent] ${message}`)
    }

    warn (message) {
        this.RED.log.warn(`[flowfuse-remote-agent] ${message}`)
    }
}

module.exports = { Agent }
