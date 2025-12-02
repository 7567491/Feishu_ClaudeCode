#!/bin/bash
# Claude进程监控和自动清理脚本
# 用途: 防止测试进程泄漏、监控PM2稳定性
# 运行: 添加到crontab */30 * * * * /home/ccp/scripts/monitor-claude-processes.sh

set -e

LOG_FILE="/home/ccp/logs/process-monitor.log"
ALERT_FILE="/home/ccp/logs/process-alerts.log"
MAX_RUNTIME_HOURS=2

# 确保日志目录存在
mkdir -p /home/ccp/logs

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚨 ALERT: $1" >> "$ALERT_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚨 ALERT: $1" >> "$LOG_FILE"
}

log "====== Starting Process Monitor ======"

# 1. 检查并清理长时间运行的测试进程
log "Checking for long-running test processes..."
LONG_RUNNING=$(ps -eo pid,etime,cmd | grep -E "(test-integration|WSClient|node.*test)" | grep -v grep | grep -v monitor || true)

if [ -n "$LONG_RUNNING" ]; then
    while IFS= read -r line; do
        PID=$(echo "$line" | awk '{print $1}')
        ETIME=$(echo "$line" | awk '{print $2}')
        CMD=$(echo "$line" | awk '{print $3,$4,$5}')

        # 检查是否运行超过1天
        if echo "$ETIME" | grep -q "-"; then
            DAYS=$(echo "$ETIME" | cut -d'-' -f1)
            if [ "$DAYS" -ge 1 ]; then
                alert "Process $PID running for $DAYS days: $CMD"
                log "Killing process $PID (runtime: $ETIME)"
                kill -9 $PID 2>/dev/null || true
                log "✅ Killed process $PID"
            fi
        else
            # 检查小时数（格式: HH:MM:SS 或 MM:SS）
            if echo "$ETIME" | grep -E "^[0-9]{2,}:" > /dev/null; then
                HOURS=$(echo "$ETIME" | cut -d: -f1)
                if [ "$HOURS" -ge "$MAX_RUNTIME_HOURS" ]; then
                    alert "Process $PID running for $HOURS hours: $CMD"
                    log "Killing process $PID (runtime: $ETIME)"
                    kill -9 $PID 2>/dev/null || true
                    log "✅ Killed process $PID"
                fi
            fi
        fi
    done <<< "$LONG_RUNNING"
else
    log "✅ No long-running test processes found"
fi

# 2. 监控PM2重启频率
log "Checking PM2 restart frequency..."
PM2_RESTARTS=$(pm2 jlist | jq -r '.[] | select(.name=="claude-code-ui") | .pm2_env.restart_time' 2>/dev/null || echo "0")

if [ -n "$PM2_RESTARTS" ] && [ "$PM2_RESTARTS" -gt 0 ]; then
    log "PM2 claude-code-ui restarts: $PM2_RESTARTS"

    # 如果重启次数超过50次，发出告警
    if [ "$PM2_RESTARTS" -gt 50 ]; then
        alert "PM2 claude-code-ui has restarted $PM2_RESTARTS times - investigate stability issues"
    fi
fi

# 3. 检查Claude CLI进程数量
log "Checking Claude CLI processes..."
CLAUDE_COUNT=$(ps aux | grep -E "claude.*--resume" | grep -v grep | wc -l)
log "Active Claude CLI sessions: $CLAUDE_COUNT"

if [ "$CLAUDE_COUNT" -gt 10 ]; then
    alert "Too many Claude CLI processes: $CLAUDE_COUNT (threshold: 10)"
fi

# 4. 检查错误日志中的terminated错误频率
log "Checking terminated errors..."
if [ -f "/home/ccp/.pm2/logs/claude-code-ui-error.log" ]; then
    # 统计terminated错误总数
    RECENT_ERRORS=$(grep -c "API Error: terminated" /home/ccp/.pm2/logs/claude-code-ui-error.log 2>/dev/null || echo "0")
    RECENT_ERRORS=$(echo "$RECENT_ERRORS" | tr -d '[:space:]')  # 移除所有空白字符

    if [ -n "$RECENT_ERRORS" ] && [ "$RECENT_ERRORS" -gt 5 ] 2>/dev/null; then
        alert "High frequency of 'terminated' errors: $RECENT_ERRORS occurrences"
    else
        log "Terminated errors in log: $RECENT_ERRORS"
    fi
fi

# 5. 检查磁盘空间
log "Checking disk space..."
DISK_USAGE=$(df -h /home/ccp | tail -1 | awk '{print $5}' | sed 's/%//' | head -1)
log "Disk usage: ${DISK_USAGE}%"

if [ -n "$DISK_USAGE" ] && [ "$DISK_USAGE" -gt 85 ] 2>/dev/null; then
    alert "Disk usage is high: ${DISK_USAGE}%"
fi

# 6. 清理旧日志（保留最近7天）
log "Cleaning old logs..."
find /home/ccp/logs -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
find /home/ccp/.pm2/logs -name "*.log" -type f -size +100M -exec truncate -s 50M {} \; 2>/dev/null || true

log "====== Process Monitor Completed ======"
echo "" >> "$LOG_FILE"

# 7. 生成进程报告（可选，不记录到日志）
if [ "$1" = "--report" ]; then
    echo ""
    echo "====== 飞书+Claude Code 进程报告 ======"
    echo ""

    # 统计信息
    echo "📊 总体统计:"
    sqlite3 /home/ccp/server/database/auth.db "SELECT
        COUNT(*) as '总会话数',
        SUM(CASE WHEN session_type='group' THEN 1 ELSE 0 END) as '群聊',
        SUM(CASE WHEN session_type='private' THEN 1 ELSE 0 END) as '私聊'
    FROM feishu_sessions WHERE is_active=1;" 2>/dev/null || echo "无法读取数据库"

    echo ""
    echo "🔥 运行中的Claude子进程:"
    CLAUDE_PROCS=$(ps aux | grep -E "claude.*--resume" | grep -v grep)
    if [ -n "$CLAUDE_PROCS" ]; then
        echo "$CLAUDE_PROCS" | awk '{printf "PID: %-8s 内存: %5s%%  CPU: %5s%%\n", $2, $4, $3}'
        TOTAL_MEM=$(echo "$CLAUDE_PROCS" | awk '{total+=$6} END {printf "%.2f", total/1024}')
        echo "总内存占用: ${TOTAL_MEM} MB"
    else
        echo "当前无运行中的子进程"
    fi

    echo ""
    echo "🖥️ 主进程状态:"
    ps aux | grep -E "(pm2|feishu)" | grep -v grep | awk '{printf "%-30s PID: %-8s 内存: %5s%%\n", $11, $2, $4}' | head -5

    echo ""
    echo "======================================"
fi
