const { EventEmitter } = require('events')
const { LogBuffer } = require('./LogBuffer')

class LogHandler extends EventEmitter {
    constructor (RED, agent) {
        super()
        this.RED = RED
        this.agent = agent
        this.enabled = false
        this.buffer = new LogBuffer(500)
        this.on('log', function (msg) {
            if (msg.level === RED.log.AUDIT) {
                this.handleAuditLog(msg)
            } else if (msg.level === RED.log.METRIC) {
                // Do nothing with metrics for now
            } else {
                const formattedMessage = formatNodeREDLogMessage(msg)
                this.buffer.add(formattedMessage)
                if (this.enabled) {
                    this.agent.mqttClient?.publishToLogStream(formattedMessage)
                }
            }
        })
        this.RED.log.addHandler(this)
    }

    enable () {
        if (!this.enabled) {
            this.agent.debug('Enable log stream')
            this.enabled = true
            // Send all buffered logs to the log stream
            const logs = this.buffer.toArray()
            this.agent.mqttClient?.publishToLogStream(logs)
        }
    }

    disable () {
        if (this.enabled) {
            this.agent.debug('Disabling log stream')
        }
        this.enabled = false
    }

    handleAuditLog (msg) {
        if (/^(comms\.|.*\.get$)/.test(msg.event)) {
            // Ignore comms events and any .get event that is just reading data
            return
        }
        if (/^auth/.test(msg.event) && !/^auth.log/.test(msg.event)) {
            return
        }
        if (msg.user) {
            msg.user = msg.user.userId
        }
        delete msg.username
        delete msg.level
        try {
            this.agent.sendAuditEvent(msg)
        } catch (err) {
            this.agent.error(`Error handling audit log: ${err.message}`)
        }
    }
}

let lastLogTimestamp = 0
let lastLogTimestampCount = 0

const levelNames = {
    10: 'fatal',
    20: 'error',
    30: 'warn',
    40: 'info',
    50: 'debug',
    60: 'trace',
    98: 'audit',
    99: 'metric'
}

function formatNodeREDLogMessage (msg) {
    // Convert Node-RED log message object to the format we want to send to the platform
    //  - msg.timestamp maps to msg.ts, with a counter appended to ensure uniqueness
    //  - msg.level maps to the string level name

    msg.ts = msg.timestamp
    if (msg.ts === lastLogTimestamp) {
        lastLogTimestampCount++
    } else {
        lastLogTimestamp = msg.ts
        lastLogTimestampCount = 0
    }
    msg.ts = msg.ts + ('' + lastLogTimestampCount).padStart(4, '0')
    msg.level = levelNames[msg.level] || 'unknown'
    delete msg.timestamp
    return msg
}

module.exports = {
    LogHandler
}
