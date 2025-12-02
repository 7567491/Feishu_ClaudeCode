/**
 * Service Monitor
 *
 * Tracks service health, restarts, errors and sends alerts
 */

class ServiceMonitor {
    constructor() {
        this.startTime = Date.now();
        this.restartCount = 0;
        this.errorLog = [];
        this.metrics = {
            requests: 0,
            errors: 0,
            lastErrorTime: null,
            lastRestartTime: null
        };

        // Alert thresholds
        this.thresholds = {
            maxRestartsInWindow: 5,        // Max restarts
            restartWindow: 5 * 60 * 1000,  // in 5 minutes
            maxErrorRate: 0.1,             // 10% error rate
            errorRateWindow: 60 * 1000     // in 1 minute
        };

        this.alerts = [];
    }

    /**
     * Record a server restart
     */
    recordRestart() {
        this.restartCount++;
        this.metrics.lastRestartTime = Date.now();

        const uptime = Date.now() - this.startTime;
        const restartsInWindow = this.getRestartsInWindow();

        console.log(`[Monitor] Restart recorded. Total: ${this.restartCount}, In window: ${restartsInWindow}`);

        // Check if restart rate is too high
        if (restartsInWindow > this.thresholds.maxRestartsInWindow) {
            this.alert('critical', `High restart rate: ${restartsInWindow} restarts in ${this.thresholds.restartWindow/1000}s`);
        }
    }

    /**
     * Get number of restarts in the recent window
     */
    getRestartsInWindow() {
        const windowStart = Date.now() - this.thresholds.restartWindow;

        // In a real implementation, you'd track restart timestamps
        // For now, use a simple heuristic
        const avgRestartInterval = this.restartCount > 0
            ? (Date.now() - this.startTime) / this.restartCount
            : Infinity;

        if (avgRestartInterval < this.thresholds.restartWindow) {
            return Math.floor(this.thresholds.restartWindow / avgRestartInterval);
        }

        return 0;
    }

    /**
     * Record an error
     */
    recordError(error, context = {}) {
        const errorEntry = {
            time: new Date(),
            message: error.message || String(error),
            stack: error.stack,
            context,
            code: error.code
        };

        this.errorLog.push(errorEntry);
        this.metrics.errors++;
        this.metrics.lastErrorTime = Date.now();

        // Keep only last 100 errors
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }

        // Check error rate
        this.checkErrorRate();

        console.error(`[Monitor] Error recorded: ${error.message}`);
    }

    /**
     * Record a successful request
     */
    recordRequest() {
        this.metrics.requests++;
    }

    /**
     * Check if error rate is too high
     */
    checkErrorRate() {
        const windowStart = Date.now() - this.thresholds.errorRateWindow;
        const recentErrors = this.errorLog.filter(e => e.time.getTime() > windowStart);

        const errorRate = this.metrics.requests > 0
            ? recentErrors.length / this.metrics.requests
            : 0;

        if (errorRate > this.thresholds.maxErrorRate && recentErrors.length > 5) {
            this.alert('warning', `High error rate: ${(errorRate * 100).toFixed(2)}% (${recentErrors.length} errors)`);
        }
    }

    /**
     * Send an alert
     */
    alert(level, message) {
        const alert = {
            level,
            message,
            time: new Date(),
            resolved: false
        };

        this.alerts.push(alert);

        // Keep only last 50 alerts
        if (this.alerts.length > 50) {
            this.alerts.shift();
        }

        // Log alert
        const emoji = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️';
        console.error(`\n${emoji} [ALERT] [${level.toUpperCase()}] ${message}\n`);

        // In a real implementation, send to external alerting system:
        // - Feishu/DingTalk webhook
        // - Email
        // - PagerDuty
        // - Slack
        // this.sendToAlertingSystem(alert);
    }

    /**
     * Get monitoring report
     */
    getReport() {
        const uptime = Date.now() - this.startTime;
        const uptimeHours = (uptime / 1000 / 60 / 60).toFixed(2);

        return {
            uptime: {
                ms: uptime,
                readable: this.formatUptime(uptime)
            },
            restarts: {
                total: this.restartCount,
                inWindow: this.getRestartsInWindow(),
                avgInterval: this.restartCount > 0
                    ? uptime / this.restartCount
                    : Infinity,
                lastRestartTime: this.metrics.lastRestartTime
                    ? new Date(this.metrics.lastRestartTime).toISOString()
                    : null
            },
            errors: {
                total: this.metrics.errors,
                recent: this.errorLog.slice(-10),
                lastErrorTime: this.metrics.lastErrorTime
                    ? new Date(this.metrics.lastErrorTime).toISOString()
                    : null
            },
            requests: {
                total: this.metrics.requests,
                errorRate: this.metrics.requests > 0
                    ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) + '%'
                    : '0%'
            },
            alerts: {
                total: this.alerts.length,
                unresolved: this.alerts.filter(a => !a.resolved).length,
                recent: this.alerts.slice(-5)
            },
            health: this.getHealthStatus()
        };
    }

    /**
     * Get overall health status
     */
    getHealthStatus() {
        const restartsInWindow = this.getRestartsInWindow();

        if (restartsInWindow > this.thresholds.maxRestartsInWindow) {
            return 'critical';
        }

        if (this.metrics.errors > 10 && this.metrics.requests > 0) {
            const errorRate = this.metrics.errors / this.metrics.requests;
            if (errorRate > this.thresholds.maxErrorRate) {
                return 'warning';
            }
        }

        if (this.alerts.filter(a => !a.resolved).length > 3) {
            return 'warning';
        }

        return 'healthy';
    }

    /**
     * Format uptime in readable format
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Reset metrics
     */
    reset() {
        this.errorLog = [];
        this.metrics.requests = 0;
        this.metrics.errors = 0;
        console.log('[Monitor] Metrics reset');
    }

    /**
     * Get summary for logging
     */
    getSummary() {
        const report = this.getReport();
        return {
            uptime: report.uptime.readable,
            restarts: report.restarts.total,
            errors: report.errors.total,
            health: report.health
        };
    }
}

// Singleton instance
export const monitor = new ServiceMonitor();

// Export class for testing
export { ServiceMonitor };
