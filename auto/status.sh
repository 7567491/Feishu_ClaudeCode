#!/bin/bash
echo "=== 当前状态检查 ==="
echo ""
echo "1. 任务状态文件:"
if [ -f task-state.json ]; then
    CURRENT_TASK=$(node -e "const s=require('./task-state.json'); console.log(s.currentTaskIndex+1)")
    TOTAL_TASKS=$(node -e "const s=require('./task-state.json'); console.log(s.tasks.length)")
    STATUS=$(node -e "const s=require('./task-state.json'); console.log(s.globalStatus)")
    echo "   ✅ 已生成"
    echo "   当前任务: ${CURRENT_TASK}/${TOTAL_TASKS}"
    echo "   状态: ${STATUS}"
else
    echo "   ❌ 未生成（首次运行时会自动生成）"
fi

echo ""
echo "2. Cron 任务:"
if crontab -l 2>/dev/null | grep -q "auto-dev.sh"; then
    echo "   ✅ 已配置"
    crontab -l | grep auto-dev.sh
else
    echo "   ❌ 未配置"
fi

echo ""
echo "3. 飞书环境变量:"
echo "   FeishuCC_App_ID: ${FeishuCC_App_ID:+已设置}"
echo "   FeishuCC_App_Secret: ${FeishuCC_App_Secret:+已设置}"
echo "   FEISHU_NOTIFY_RECEIVE_ID: ${FEISHU_NOTIFY_RECEIVE_ID:-未设置}"
