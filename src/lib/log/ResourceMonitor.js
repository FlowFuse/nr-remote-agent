const crypto = require('node:crypto')
const os = require('node:os')

const client = require('prom-client')
const LRUMap = require('mnemonist/lru-map')
const { Counter } = require('prom-client')

const { LogBuffer } = require('./LogBuffer')

const RESOURCE_POLL_INTERVAL = 10 // seconds

let pptf
(async function () {
    try {
        pptf = (await import('parse-prometheus-text-format')).default
    } catch (err) {
        console.error(err)
    }
})()

const instanceId = crypto.createHash('md5').update(os.hostname()).digest('hex').substring(0, 4)
let lastCPUTime = 0

/**
 * ResourceMonitor is responsible for collecting resource metrics from Node-RED and sending them to the platform.
 * It uses prom-client to collect metrics and maintains a buffer of the last 2520 samples (7 hours at 10s intervals).
 * It can start and stop streaming resource metrics to the platform.
 *
 * This is based on the Device Agent implementation of the same functionality - but adapted for the Remote Agent
 */
class ResourceMonitor {
    constructor (RED, agent) {
        this.RED = RED
        this.agent = agent
        this.buffer = new LogBuffer(2520)

        // Set up prom-client to collect default metrics
        const collectDefaultMetrics = client.collectDefaultMetrics
        const Registry = client.Registry
        this.register = new Registry()
        collectDefaultMetrics({ register: this.register })

        // Add the custom metrics for Node-RED message counts
        this.messageCounter = new Counter({
            name: 'nodered_messages_total',
            help: 'Count of unique messages handled by the flows',
            registers: [this.register]
        })
        this.nodeReceiveCounter = new Counter({
            name: 'nodered_node_receive_events_total',
            help: 'Count of node receive events',
            registers: [this.register]
        })
        this.nodeSendCounter = new Counter({
            name: 'nodered_node_send_events_total',
            help: 'Count of node send events',
            registers: [this.register]
        })

        this.inflightMessages = new LRUMap(1000)
        this.loggedError = false

        this.resourceStreamEnabled = false

        // Start the resource sampling interval
        this.pollInterval = setInterval(() => {
            try {
                this.sampleMetrics()
            } catch (err) {
                this.agent.error(`Error sampling metrics: ${err.message}`)
            }
        }, RESOURCE_POLL_INTERVAL * 1000)
        this.pollInterval.unref() // Allow the process to exit if this is the only thing left running
    }

    /**
     * Start streaming resource metrics to the platform.
     * This will send all buffered samples to the platform, and then continue to send new samples as they are collected.
     */
    startResourceStream () {
        if (!this.resourceStreamEnabled) {
            this.agent.debug('Enabling resource stream')
            this.resourceStreamEnabled = true
            // Send all buffered samples to the resource stream
            const samples = this.buffer.toArray()
            this.agent.mqttClient?.publishToResourceStream(samples)
        }
    }

    /**
     * Stop streaming resource metrics to the platform.
     */
    stopResourceStream () {
        if (this.resourceStreamEnabled) {
            this.agent.debug('Disabling resource stream')
            this.resourceStreamEnabled = false
        }
    }

    /**
     * Handle a metrics log event from Node-RED.
     * @param {Object} msg Node-RED metrics log event
     */
    handleMetricsLog (msg) {
        try {
            if (this.messageCounter) {
                // Only listen for node events
                if (/^node/.test(msg.event)) {
                    if (!this.inflightMessages.has(msg.msgid)) {
                        this.messageCounter.inc()
                    }
                    this.inflightMessages.set(msg.msgid, msg.timestamp)
                    if (/\.send$/.test(msg.event)) {
                        this.nodeSendCounter.inc()
                    }
                    if (/\.receive$/.test(msg.event)) {
                        this.nodeReceiveCounter.inc()
                    }
                }
            }
            this.loggedError = false // Reset the error flag on successful logging
        } catch (err) {
            // If the metrics logger fails, we don't want to crash the process
            // so just log the error - but we don't want to flood the log in case
            // of a persistent error, so we only log the first error
            if (!this.loggedError) {
                this.loggedError = true
                this.agent.error('Metrics logger error:' + err)
            }
        }
    }

    /**
     * Grab a snapshot of the current resource metrics and add to the buffer.
     * This is called on a regular interval to capture a history of samples.
     *
     * If resource streaming is enabled, also send the sample to the platform
     */
    async sampleMetrics () {
        const sample = {
            src: instanceId,
            ts: Date.now()
        }
        // Get the metrics from prom-client and parse them to a JSON object
        const parsed = pptf(await this.register.metrics())
        parsed.forEach(metric => {
            if (metric.name === 'process_resident_memory_bytes') {
                sample.ps = parseInt(metric.metrics[0].value) / (1024 * 1024)
            } else if (metric.name === 'process_cpu_seconds_total') {
                const cpuTime = parseFloat(metric.metrics[0].value)
                if (cpuTime > lastCPUTime) {
                    if (lastCPUTime !== 0) {
                        const delta = cpuTime - lastCPUTime
                        sample.cpu = (delta / RESOURCE_POLL_INTERVAL) * 100
                    }
                } else {
                    // show 0 if the CPU time has not increased
                    // this can happen if the process was restarted
                    sample.cpu = 0
                }
                lastCPUTime = cpuTime
            } else if (metric.name === 'nodejs_eventloop_lag_mean_seconds') {
                sample.ela = parseFloat(metric.metrics[0].value)
            } else if (metric.name === 'nodejs_eventloop_lag_p99_seconds') {
                sample.el99 = parseFloat(metric.metrics[0].value)
            } else if (metric.name === 'nodered_messages_total') {
                sample.nrmsgs = parseInt(metric.metrics[0].value)
            } else if (metric.name === 'nodered_node_receive_events_total') {
                sample.nrrecv = parseInt(metric.metrics[0].value)
            } else if (metric.name === 'nodered_node_send_events_total') {
                sample.nrsend = parseInt(metric.metrics[0].value)
            }
        })
        this.buffer.add(sample)
        if (this.resourceStreamEnabled) {
            this.agent.mqttClient?.publishToResourceStream(sample)
        }
    }
}

module.exports = {
    ResourceMonitor
}
