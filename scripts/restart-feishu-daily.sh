#!/bin/bash

# 每日定时重启飞书服务脚本
# 建议在凌晨3点执行，此时用户活动最少

LOG_FILE="/home/ccp/logs/feishu-restart.log"
SERVICE_NAME="feishu"
CHAT_ID="oc_15a90daa813d981076ffa50c0de0b5e4"

# 确保日志目录存在
mkdir -p /home/ccp/logs

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行每日定时重启..." >> $LOG_FILE

# 发送重启前通知
node -e "
    import { FeishuClient } from '/home/ccp/server/lib/feishu-client.js';
    const client = new FeishuClient({
        appId: process.env.FeishuCC_App_ID,
        appSecret: process.env.FeishuCC_App_Secret
    });
    client.sendTextMessage('$CHAT_ID', '🔄 定时维护: 即将重启飞书服务进行例行维护...');
" 2>&1 >> $LOG_FILE

# 等待消息发送完成
sleep 2

# 重启服务
pm2 restart $SERVICE_NAME >> $LOG_FILE 2>&1

# 等待服务启动
sleep 5

# 检查服务状态
pm2_status=$(pm2 show $SERVICE_NAME 2>/dev/null | grep "status" | awk '{print $4}')

if [ "$pm2_status" == "online" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 服务重启成功" >> $LOG_FILE

    # 发送重启成功通知
    node -e "
        import { FeishuClient } from '/home/ccp/server/lib/feishu-client.js';
        const client = new FeishuClient({
            appId: process.env.FeishuCC_App_ID,
            appSecret: process.env.FeishuCC_App_Secret
        });
        const now = new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});
        client.sendTextMessage('$CHAT_ID', '✅ 定时维护完成\\n时间: ' + now + '\\n飞书服务已成功重启');
    " 2>&1 >> $LOG_FILE
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 服务重启失败，尝试启动..." >> $LOG_FILE
    pm2 start $SERVICE_NAME >> $LOG_FILE 2>&1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 定时重启任务完成" >> $LOG_FILE