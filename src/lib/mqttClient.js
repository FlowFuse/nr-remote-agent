const settings = require('./settings')
const mqtt = require('mqtt')
const { randomInt } = require('crypto')
const { IntervalJitter } = require('./utils/IntervalJitter')

class MqttAgentClient {
    constructor (RED, agent) {
        this.RED = RED
        /** @type {import('./agent').Agent} */
        this.agent = agent
        this.heartbeat = new IntervalJitter()
        this.commandTopic = `ff/v1/${this.agent.teamId}/d/${this.agent.deviceId}/command`
        this.statusTopic = `ff/v1/${this.agent.teamId}/d/${this.agent.deviceId}/status`
        this.logTopic = `ff/v1/${this.agent.teamId}/d/${this.agent.deviceId}/logs`
        this.resourcesTopic = `ff/v1/${this.agent.teamId}/d/${this.agent.deviceId}/resources`
        this.responseTopic = `ff/v1/${this.agent.teamId}/d/${this.agent.deviceId}/response`
    }

    connect () {
        const credentials = settings.get('credentials')?.broker
        this.brokerConfig = {
            clientId: credentials.username,
            username: credentials.username,
            password: credentials.password,
            reconnectPeriod: randomInt(13000, 25000),
            reconnectOnConnackError: true,
            queueQoSZero: false
        }
        const brokerURL = new URL(credentials.url)
        const connectOpts = {
            protocol: brokerURL.protocol.replace(/:$/, ''),
            host: brokerURL.hostname,
            port: brokerURL.port
        }
        const opts = Object.assign({}, connectOpts, this.brokerConfig)
        this.RED.comms.publish('flowfuse-remote-agent/state', { state: 'connecting' }, true)
        this.client = mqtt.connect(opts)
        this.client.on('connect', () => {
            this.agent.log('Connected to FlowFuse')
            this.RED.comms.publish('flowfuse-remote-agent/state', { state: 'connected' }, true)
            this.publish(this.statusTopic, JSON.stringify(this.agent.getState()))
        })
        this.client.on('close', () => { })
        this.client.on('reconnect', () => {
            this.RED.comms.publish('flowfuse-remote-agent/state', { state: 'connecting' }, true)
            this.agent.log('Reconnecting to FlowFuse')
        })
        this.client.on('error', (err) => {
            // this.RED.comms.publish('flowfuse-remote-agent/state', { state: 'error' }, true)
            // TODO: tidy up error reporting
            if (err.cause) {
                this.agent.warn(`Connection error: ${err.cause.toString()}`)
            } else if (err.errors && Array.isArray(err.errors)) {
                for (const e in err.errors) {
                    this.agent.warn(`Connection error: ${err.errors[e].toString()}`)
                }
            } else {
                this.agent.warn(`Connection error: ${err.toString()}`)
            }
        })

        this.client.on('message', async (topic, message, packet) => {
            this.agent.debug(`MQTT message received on topic ${topic}: ${message.toString()}`)

            const topicParts = topic.split('/')
            if (topicParts[5] === 'command') {
                // Handle command message
                const command = JSON.parse(message.toString())
                if (command.command === 'update') {
                    this.agent.debug('Received update command')
                    await this.agent.handleUpdateCommand(command)
                } else if (command.command === 'startLog') {
                    this.agent.startLogStream()
                } else if (command.command === 'stopLog') {
                    this.agent.stopLogStream()
                } else if (command.command === 'upload') {
                    const snapshot = await this.agent.generateSnapshot()
                    this.sendCommandResponse(command, snapshot)
                }
            }
        })

        this.client.subscribe([this.commandTopic])

        const period = 60
        const jitter = 10
        this.agent.log(`Starting MQTT heartbeat thread. Interval: ${period}s (±${jitter / 2}s)`)
        // initial heartbeat to be operated at 255ms (±250ms)
        this.heartbeat.start({ interval: period * 1000, jitter: jitter * 1000, firstInterval: 10, firstJitter: 500 }, () => {
            this.sendStatus()
        })
    }

    disconnect () {
        this.heartbeat.stop()
        this.client.end(true)
    }

    publish (topic, message, options) {
        this.agent.debug(`[PUB] ${topic} ${JSON.stringify(message)}`)
        this.client.publish(topic, message, options)
    }

    sendStatus () {
        const payload = this.agent.getState()
        if (!payload) {
            return
        }
        this.agent.debug('Sending status message')
        this.agent.debug(this.statusTopic)
        this.agent.debug(JSON.stringify(payload))
        this.client.publish(this.statusTopic, JSON.stringify(payload))
    }

    sendCommandResponse (request, response) {
        const correlationData = request?.correlationData
        const responseTopic = request?.responseTopic || this.responseTopic
        const userProperties = request?.userProperties || {}
        const command = request?.command

        if (!correlationData || !responseTopic || !command) {
            this.agent.warn('Invalid command response, cannot send response to forge platform')
            return
        }
        const message = {
            teamId: this.agent.teamId, // for message routing and verification
            deviceId: this.agent.deviceId, // for message routing and verification
            command, // for command response verification
            correlationData, // for correlating response with request
            userProperties, // for any additional metadata
            payload: response // the actual response payload
        }
        const messageJSON = JSON.stringify(message)
        this.client.publish(responseTopic, messageJSON, (err) => {
            if (err) {
                this.agent.warn(`Error sending response to command ${command}: ${err}`)
            }
        })
    }

    publishToLogStream (logMessage) {
        this.client.publish(this.logTopic, JSON.stringify(logMessage))
    }
}

module.exports = { MqttAgentClient }
