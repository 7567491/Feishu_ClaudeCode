#!/bin/bash
# 深度清理脚本 - 安全版本（带确认提示）
# 预计可节省 4.5-10GB 空间

set -e  # 遇到错误立即停止

echo "================================================"
echo "  Claude Code UI - 深度清理脚本"
echo "  预计可节省: 4.5-10GB 空间"
echo "================================================"
echo ""

# 统计函数
function show_size() {
    if [ -e "$1" ]; then
        du -sh "$1" 2>/dev/null | awk '{print $1}'
    else
        echo "0"
    fi
}

TOTAL_SAVED=0

# ==================== 1. 清理 pip 缓存 ====================
echo "【1/8】检查 pip 缓存..."
PIP_SIZE=$(show_size ~/.cache/pip)
if [ -d ~/.cache/pip ]; then
    echo "  当前大小: $PIP_SIZE"
    read -p "  是否清理? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pip cache purge
        echo "  ✅ pip 缓存已清理"
    fi
else
    echo "  ℹ️  无 pip 缓存"
fi

# ==================== 2. 清理 PM2 旧日志 ====================
echo ""
echo "【2/8】检查 PM2 日志..."
if [ -f ~/.pm2/logs/zhanglu-33-calendar-error.log ]; then
    PM2_SIZE=$(show_size ~/.pm2/logs/zhanglu-33-calendar-*.log)
    echo "  旧项目日志大小: $PM2_SIZE"
    read -p "  是否删除旧项目日志? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm ~/.pm2/logs/zhanglu-33-calendar-*.log
        echo "  ✅ 旧日志已删除"
    fi
fi

# 轮转当前日志
if [ -f ~/.pm2/logs/claude-code-ui-out.log ]; then
    LOG_SIZE=$(show_size ~/.pm2/logs/claude-code-ui-out.log)
    echo "  当前主日志大小: $LOG_SIZE"
    if [ $(stat -c%s ~/.pm2/logs/claude-code-ui-out.log) -gt 10000000 ]; then  # >10MB
        read -p "  是否轮转主日志(保留最后1000行)? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            tail -n 1000 ~/.pm2/logs/claude-code-ui-out.log > /tmp/tmp_pm2.log
            mv /tmp/tmp_pm2.log ~/.pm2/logs/claude-code-ui-out.log
            echo "  ✅ 主日志已轮转"
        fi
    fi
fi

# ==================== 3. 清理 Python 字节码 ====================
echo ""
echo "【3/8】清理 Python 字节码缓存..."
PYCACHE_COUNT=$(find /home/ccp -name "__pycache__" -type d 2>/dev/null | wc -l)
echo "  发现 $PYCACHE_COUNT 个 __pycache__ 目录"
if [ $PYCACHE_COUNT -gt 0 ]; then
    read -p "  是否清理? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find /home/ccp -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        find /home/ccp -name "*.pyc" -delete 2>/dev/null || true
        echo "  ✅ Python 字节码已清理"
    fi
fi

# ==================== 4. 清理旧版本 Codex ====================
echo ""
echo "【4/8】检查旧版本 Codex..."
if [ -d /home/ccp/codex-0.63.0 ]; then
    CODEX_SIZE=$(show_size /home/ccp/codex-0.63.0)
    echo "  旧版本大小: $CODEX_SIZE"
    echo "  (已有新版本 .codex/)"
    read -p "  是否删除? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf /home/ccp/codex-0.63.0
        echo "  ✅ 旧版本已删除"
    fi
else
    echo "  ℹ️  无旧版本"
fi

# ==================== 5. 清理 Claude 测试残留 ====================
echo ""
echo "【5/8】清理 Claude 测试残留..."
TEST_COUNT=$(ls -d /home/ccp/.claude-logs/playwright* /home/ccp/.claude-logs/jest_st 2>/dev/null | wc -l)
if [ $TEST_COUNT -gt 0 ]; then
    echo "  发现 $TEST_COUNT 个测试残留目录"
    read -p "  是否清理? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf /home/ccp/.claude-logs/playwright* 2>/dev/null || true
        rm -rf /home/ccp/.claude-logs/jest_st 2>/dev/null || true
        rm -rf /home/ccp/.claude-logs/tmpapw6qml0 2>/dev/null || true
        echo "  ✅ 测试残留已清理"
    fi
else
    echo "  ℹ️  无测试残留"
fi

# ==================== 6. 移动根目录临时文件 ====================
echo ""
echo "【6/8】整理根目录临时文件..."
TEMP_FILES=$(ls /home/ccp/cc.html /home/ccp/cc.md /home/ccp/渣男_*.md 2>/dev/null | wc -l)
if [ $TEMP_FILES -gt 0 ]; then
    echo "  发现 $TEMP_FILES 个临时文件"
    read -p "  是否移动到 test/temp-files/? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mkdir -p /home/ccp/test/temp-files
        mv /home/ccp/cc.html /home/ccp/cc.md /home/ccp/test/temp-files/ 2>/dev/null || true
        mv /home/ccp/渣男_*.md /home/ccp/test/temp-files/ 2>/dev/null || true
        mv /home/ccp/test-zhanglu-scenario-c.js /home/ccp/test/ 2>/dev/null || true
        rm /home/ccp/teacher.log 2>/dev/null || true
        echo "  ✅ 临时文件已整理"
    fi
else
    echo "  ℹ️  无临时文件"
fi

# ==================== 7. 第三方项目克隆 ====================
echo ""
echo "【7/8】检查第三方项目克隆..."
if [ -d /home/ccp/gpt-researcher ] || [ -d /home/ccp/storm ]; then
    GPT_SIZE=$(show_size /home/ccp/gpt-researcher)
    STORM_SIZE=$(show_size /home/ccp/storm)
    echo "  gpt-researcher: $GPT_SIZE"
    echo "  storm: $STORM_SIZE"
    read -p "  是否删除这些克隆仓库? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf /home/ccp/gpt-researcher /home/ccp/storm
        echo "  ✅ 第三方项目已删除"
    fi
else
    echo "  ℹ️  无第三方克隆"
fi

# ==================== 8. npm 缓存清理 ====================
echo ""
echo "【8/8】清理 npm 缓存..."
NPM_SIZE=$(show_size ~/.npm)
if [ -d ~/.npm ]; then
    echo "  npm 缓存大小: $NPM_SIZE"
    read -p "  是否清理? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm cache clean --force
        echo "  ✅ npm 缓存已清理"
    fi
else
    echo "  ℹ️  无 npm 缓存"
fi

# ==================== 总结 ====================
echo ""
echo "================================================"
echo "  清理完成！"
echo "================================================"
echo ""
echo "建议后续操作："
echo "1. 运行 'git status' 检查未追踪文件"
echo "2. 配置 PM2 日志自动轮转: pm2 install pm2-logrotate"
echo "3. 定期运行此脚本（建议每月一次）"
echo ""
