#!/bin/bash

# Paper 功能修复验证脚本
# 用途：验证 feishu 服务已加载最新的 paper 功能代码

set -e  # 遇到错误立即退出

echo "🔍 Paper 功能修复验证"
echo "================================"
echo ""

# 1. 检查服务状态
echo "1️⃣  检查 feishu 服务状态..."
if pm2 list | grep -q "feishu.*online"; then
    echo "   ✅ feishu 服务正在运行"

    # 获取 uptime
    uptime=$(pm2 jlist | jq -r '.[] | select(.name=="feishu") | .pm2_env.pm_uptime' 2>/dev/null || echo "unknown")
    if [ "$uptime" != "unknown" ]; then
        start_time=$((uptime / 1000))
        current_time=$(date +%s)
        uptime_seconds=$((current_time - start_time))
        uptime_minutes=$((uptime_seconds / 60))
        echo "   ⏱️  运行时长: ${uptime_minutes} 分钟"
    fi
else
    echo "   ❌ feishu 服务未运行"
    exit 1
fi
echo ""

# 2. 检查代码文件
echo "2️⃣  检查 paper 功能代码文件..."
if [ -f "server/feishu-ws.js" ]; then
    if grep -q "trimmedText.toLowerCase().startsWith('paper ')" server/feishu-ws.js; then
        echo "   ✅ feishu-ws.js 包含 paper 检测逻辑"
    else
        echo "   ❌ feishu-ws.js 缺少 paper 检测逻辑"
        exit 1
    fi
else
    echo "   ❌ feishu-ws.js 文件不存在"
    exit 1
fi

if [ -f "server/lib/paper-command-handler.js" ]; then
    echo "   ✅ paper-command-handler.js 存在"
else
    echo "   ❌ paper-command-handler.js 文件不存在"
    exit 1
fi
echo ""

# 3. 运行单元测试
echo "3️⃣  运行检测逻辑单元测试..."
if node test/paper-detection-test.js > /dev/null 2>&1; then
    echo "   ✅ 单元测试通过"
else
    echo "   ❌ 单元测试失败"
    exit 1
fi
echo ""

# 4. 检查最近的日志
echo "4️⃣  检查服务启动日志..."
if pm2 logs feishu --lines 20 --nostream 2>&1 | grep -q "Feishu service is running"; then
    echo "   ✅ 服务启动日志正常"
else
    echo "   ⚠️  未找到启动成功日志"
fi
echo ""

# 5. 检查数据库连接
echo "5️⃣  检查数据库连接..."
if sqlite3 server/database/auth.db "SELECT COUNT(*) FROM feishu_sessions;" > /dev/null 2>&1; then
    session_count=$(sqlite3 server/database/auth.db "SELECT COUNT(*) FROM feishu_sessions;")
    echo "   ✅ 数据库连接正常 (${session_count} 个会话)"
else
    echo "   ❌ 数据库连接失败"
    exit 1
fi
echo ""

# 总结
echo "================================"
echo "✅ 验证完成！系统状态正常"
echo ""
echo "📋 下一步测试："
echo "   在飞书群聊中发送：paper 深度学习"
echo ""
echo "🔍 预期行为："
echo "   1. 收到 \"🚀 Paper 文献检索系统已启动\" 消息"
echo "   2. 显示详细的执行步骤（1/6, 2/6...）"
echo "   3. 生成文献综述 MD 文件"
echo "   4. 下载并发送论文 PDF"
echo ""
echo "⚠️  如果仍然只收到 \"Response sent\":"
echo "   请查看日志: pm2 logs feishu --lines 50"
echo ""
