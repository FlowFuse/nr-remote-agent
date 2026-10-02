class LogBuffer {
    constructor (size = 500) {
        this.size = size
        this.buffer = new Array(this.size)
        this.head = 0
        this.wrapped = false
    }

    add (logEntry) {
        this.buffer[this.head++] = logEntry
        if (this.head === this.size) {
            this.head = 0
            this.wrapped = true
        }
        return logEntry
    }

    clear () {
        this.buffer = new Array(this.size)
        this.head = 0
        this.wrapped = false
    }

    toArray () {
        if (!this.wrapped) {
            return this.buffer.slice(0, this.head)
        } else {
            const result = this.buffer.slice(this.head, this.size)
            result.push(...this.buffer.slice(0, this.head))
            return result
        }
    }
}

module.exports = { LogBuffer }
