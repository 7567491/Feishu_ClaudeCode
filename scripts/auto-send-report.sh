#!/bin/bash
# 自动发送进程监控报告到飞书会话
# 用于cron定时任务

# 加载环境变量（从.env文件）
if [ -f /home/ccp/.env ]; then
    export $(grep -v '^#' /home/ccp/.env | grep -v '^$' | xargs)
fi

# 设置变量
CHAT_ID="oc_15a90daa813d981076ffa50c0de0b5e4"
SCRIPT_PATH="/home/ccp/scripts/send-process-report-with-summary.js"
LOG_FILE="/home/ccp/logs/auto-report.log"

# 确保日志目录存在
mkdir -p /home/ccp/logs

# 记录执行时间
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting automatic report generation..." >> "$LOG_FILE"

# 切换到会话目录并执行脚本
cd "/home/ccp/feicc/group-${CHAT_ID}" 2>/dev/null || cd /home/ccp

# 执行报告生成脚本
/usr/bin/node "$SCRIPT_PATH" "$CHAT_ID" >> "$LOG_FILE" 2>&1

# 记录执行结果
if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Report sent successfully" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Report sending failed" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
