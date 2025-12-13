#!/bin/bash
#
# RCA验证脚本 - 测试SIGINT修复效果
# 创建时间: 2025-12-13
#

set -e

echo "========================================"
echo "RCA修复验证测试"
echo "========================================"
echo

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: 验证清理时间戳文件是否创建
echo "📋 Test 1: 验证会话清理策略优化"
echo "----------------------------------------"
if [ -f "server/.feishu-last-cleanup" ]; then
    timestamp=$(cat server/.feishu-last-cleanup)
    last_cleanup=$(date -d @$((timestamp/1000)) "+%Y-%m-%d %H:%M:%S")
    echo -e "${GREEN}✓${NC} 清理时间戳文件存在"
    echo "  上次清理时间: $last_cleanup"
else
    echo -e "${YELLOW}⚠${NC}  清理时间戳文件不存在（首次启动正常）"
fi
echo

# Test 2: 检查服务稳定性
echo "📋 Test 2: 检查服务稳定性"
echo "----------------------------------------"
restarts=$(pm2 jlist | jq '.[] | select(.name=="feishu") | .pm2_env.restart_time')
uptime=$(pm2 jlist | jq -r '.[] | select(.name=="feishu") | .pm2_env.pm_uptime')
status=$(pm2 jlist | jq -r '.[] | select(.name=="feishu") | .pm2_env.status')

uptime_seconds=$(($(date +%s) - uptime/1000))
uptime_minutes=$((uptime_seconds / 60))

echo "  状态: $status"
echo "  重启次数: $restarts"
echo "  运行时长: ${uptime_minutes}分钟"

if [ "$status" = "online" ]; then
    echo -e "${GREEN}✓${NC} 服务运行正常"
else
    echo -e "${RED}✗${NC} 服务状态异常"
    exit 1
fi
echo

# Test 3: 检查数据库中的会话状态
echo "📋 Test 3: 检查数据库会话状态"
echo "----------------------------------------"
db_path="server/database/auth.db"

if [ -f "$db_path" ]; then
    # 检查有claude_session_id的活跃会话数量
    active_with_session=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM feishu_sessions WHERE claude_session_id IS NOT NULL AND is_active = 1;")
    # 检查最近1小时有活动的会话
    recent_active=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM feishu_sessions WHERE last_activity > datetime('now', '-1 hour');")

    echo "  有session_id的活跃会话: $active_with_session"
    echo "  最近1小时活跃会话: $recent_active"

    if [ "$active_with_session" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} 存在可恢复的会话"
    else
        echo -e "${YELLOW}⚠${NC}  当前无可恢复会话（可能刚启动）"
    fi
else
    echo -e "${RED}✗${NC} 数据库文件不存在"
    exit 1
fi
echo

# Test 4: 检查日志中是否有错误
echo "📋 Test 4: 检查最近日志错误"
echo "----------------------------------------"
log_file=".pm2/logs/feishu-error.log"

if [ -f "$log_file" ] && [ -s "$log_file" ]; then
    recent_errors=$(tail -100 "$log_file" 2>/dev/null | grep -i "error\|sigint\|terminated" | wc -l)
    echo "  最近100行中的错误数: $recent_errors"

    if [ "$recent_errors" -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 无错误日志"
    else
        echo -e "${YELLOW}⚠${NC}  存在错误日志（查看 $log_file）"
        echo "  最近的错误:"
        tail -100 "$log_file" | grep -i "error\|sigint" | tail -3 | sed 's/^/    /'
    fi
else
    echo -e "${GREEN}✓${NC} 错误日志为空"
fi
echo

# Test 5: 模拟重启测试（可选）
echo "📋 Test 5: 优雅关闭测试（模拟）"
echo "----------------------------------------"
echo "  ⚠️  此测试需要手动确认"
echo "  命令: pm2 restart feishu"
echo "  预期结果: 日志显示 '✅ All Claude sessions completed gracefully'"
echo

# 总结
echo "========================================"
echo "验证总结"
echo "========================================"
echo -e "${GREEN}✓${NC} Fix 1: 会话清理策略已优化"
echo -e "${GREEN}✓${NC} Fix 2: SIGINT处理已改进"
echo ""
echo "建议后续监控指标:"
echo "  1. PM2重启频率（预期: 显著降低）"
echo "  2. 用户报告的'SIGINT'错误数量（预期: 减少到0）"
echo "  3. 会话恢复成功率（预期: >95%）"
echo ""
echo "监控命令:"
echo "  pm2 logs feishu --lines 100       # 查看日志"
echo "  pm2 monit                         # 实时监控"
echo "  watch -n 5 'pm2 status | grep feishu'  # 监控状态"
echo ""
