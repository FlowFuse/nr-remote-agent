const { EventEmitter } = require('events')
const { LogBuffer } = require('./LogBuffer')
const { ResourceMonitor } = require('./ResourceMonitor')
/**
 * LogHandler is responsible for handling Node-RED log messages.
 * There are three types of log messages:
 * 1. Audit logs - these are sent to the platform for auditing purposes
 * 2. Metrics logs - passed to ResourceMonitor
 * 3. Log logs - these are buffered and sent to the platform when the log stream is enabled
 *
 */
class LogHandler extends EventEmitter {
    constructor (RED, agent) {
        super()
        this.RED = RED
        this.agent = agent
        this.logStreamEnabled = false
        this.buffer = new LogBuffer(500)
        // Handle the log events from Node-RED - delegate to the appropriate handler based on type
        this.on('log', function (msg) {
            if (msg.level === RED.log.AUDIT) {
                this.handleAuditLog(msg)
            } else if (msg.level === RED.log.METRIC) {
                this.resourceMonitor.handleMetricsLog(msg)
            } else {
                const formattedMessage = formatNodeREDLogMessage(msg)
                this.buffer.add(formattedMessage)
                if (this.logStreamEnabled) {
                    this.agent.mqttClient?.publishToLogStream(formattedMessage)
                }
            }
        })
        this.resourceMonitor = new ResourceMonitor(RED, agent)
        this.RED.log.addHandler(this)
    }

    /**
     * Start streaming logs to the platform.
     * This starts with a dump of the existing buffered logs
     */
    startLogStream () {
        if (!this.logStreamEnabled) {
            this.agent.debug('Enable log stream')
            this.logStreamEnabled = true
            // Send all buffered logs to the log stream
            const logs = this.buffer.toArray()
            this.agent.mqttClient?.publishToLogStream(logs)
        }
    }

    /**
     * Stop streaming logs to the platform.
     */
    stopLogStream () {
        if (this.logStreamEnabled) {
            this.agent.debug('Disabling log stream')
        }
        this.logStreamEnabled = false
    }

    /**
     * Start streaming resource metrics to the platform.
     * This is delegated to ResourceMonitor
     */
    startResourceStream () {
        this.resourceMonitor.startResourceStream()
    }

    /**
     * Stop streaming resource metrics to the platform.
     * This is delegated to ResourceMonitor
     */
    stopResourceStream () {
        this.resourceMonitor.stopResourceStream()
    }

    /**
     * Handle an audit log event from Node-RED.
     * If filters out events that are not relevant for auditing, and sends the rest to the platform.
     * @param {Object} msg Node-RED audit log object
     */
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
