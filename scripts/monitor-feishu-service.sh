#!/bin/bash

# 飞书服务监控脚本
# 检查WebSocket连接是否正常，如果异常则重启服务

LOG_FILE="/home/ccp/logs/feishu-monitor.log"
SERVICE_NAME="feishu"
TEST_CHAT_ID="oc_15a90daa813d981076ffa50c0de0b5e4"

# 确保日志目录存在
mkdir -p /home/ccp/logs

# 记录检查时间
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始检查飞书服务状态..." >> $LOG_FILE

# 检查PM2进程是否存在
pm2_status=$(pm2 show $SERVICE_NAME 2>/dev/null | grep "status" | awk '{print $4}')

if [ "$pm2_status" != "online" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] PM2进程不在线，开始重启服务..." >> $LOG_FILE
    pm2 restart $SERVICE_NAME
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 服务已重启" >> $LOG_FILE
    exit 0
fi

# 检查最近的日志活动（检查最近5分钟是否有新日志）
last_log_time=$(tail -n 1 /home/ccp/.pm2/logs/feishu-out.log 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}' | head -1)

if [ -n "$last_log_time" ]; then
    # 将日志时间转换为秒
    log_timestamp=$(date -d "$last_log_time" +%s 2>/dev/null)
    current_timestamp=$(date +%s)

    # 如果有时间信息，计算时间差
    if [ -n "$log_timestamp" ]; then
        time_diff=$((current_timestamp - log_timestamp))

        # 如果超过1小时没有新日志，认为服务可能假死
        if [ $time_diff -gt 3600 ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 检测到服务超过1小时无活动，进行健康检查..." >> $LOG_FILE

            # 尝试发送测试消息
            test_result=$(node -e "
                import { FeishuClient } from '/home/ccp/server/lib/feishu-client.js';
                const client = new FeishuClient({
                    appId: process.env.FeishuCC_App_ID,
                    appSecret: process.env.FeishuCC_App_Secret
                });

                // 尝试发送测试消息
                const testSend = async () => {
                    try {
                        await client.sendTextMessage('$TEST_CHAT_ID', '❤️ 心跳检测 - ' + new Date().toISOString());
                        console.log('SUCCESS');
                    } catch (error) {
                        console.log('FAILED');
                    }
                };

                testSend();
            " 2>&1 | grep -E "SUCCESS|FAILED" | tail -1)

            if [ "$test_result" == "FAILED" ]; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 健康检查失败，重启服务..." >> $LOG_FILE
                pm2 restart $SERVICE_NAME
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 服务已重启" >> $LOG_FILE

                # 发送通知
                sleep 5
                node -e "
                    import { FeishuClient } from '/home/ccp/server/lib/feishu-client.js';
                    const client = new FeishuClient({
                        appId: process.env.FeishuCC_App_ID,
                        appSecret: process.env.FeishuCC_App_Secret
                    });
                    client.sendTextMessage('$TEST_CHAT_ID', '🔄 自动恢复: 检测到服务异常，已自动重启飞书服务');
                " 2>&1 >> $LOG_FILE
            else
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 健康检查通过" >> $LOG_FILE
            fi
        fi
    fi
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 检查完成" >> $LOG_FILE