#!/bin/bash

##############################################################################
# auto-dev.sh - 自动化开发启动脚本
#
# 功能：
# 1. 检查暂停标记
# 2. 调用 auto-dev-runner.cjs
# 3. 实现超时控制（10分钟）
# 4. 记录执行日志
##############################################################################

set -e

# 加载环境变量（确保 cron 执行时可用）
if [ -f /etc/environment ]; then
    set -a
    source /etc/environment
    set +a
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAUSE_FILE="${SCRIPT_DIR}/.auto-dev-pause"
LOG_DIR="${SCRIPT_DIR}/logs"
TIMEOUT=600  # 10分钟

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ✅ $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ❌ $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ⚠️  $1"
}

# 确保日志目录存在
mkdir -p "${LOG_DIR}"

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "🤖 飞书集成自动化开发系统"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 检查暂停标记
if [ -f "${PAUSE_FILE}" ]; then
    log_warning "检测到暂停标记文件: ${PAUSE_FILE}"
    log_warning "系统已暂停，跳过执行"
    log "提示：删除该文件以恢复自动化"
    exit 0
fi

# 2. 检查 task-state.json
STATE_FILE="${SCRIPT_DIR}/task-state.json"
if [ ! -f "${STATE_FILE}" ]; then
    log_error "task-state.json 不存在"
    log "正在初始化..."
    cd "${SCRIPT_DIR}"
    node task-parser.cjs
fi

# 3. 检查是否已完成或暂停
GLOBAL_STATUS=$(node -e "console.log(require('${STATE_FILE}').globalStatus)")
log "当前状态: ${GLOBAL_STATUS}"

if [ "${GLOBAL_STATUS}" = "completed" ]; then
    log_success "所有任务已完成！"
    exit 0
fi

if [ "${GLOBAL_STATUS}" = "paused" ]; then
    PAUSE_REASON=$(node -e "console.log(require('${STATE_FILE}').pauseReason || '未知原因')")
    log_warning "系统已暂停: ${PAUSE_REASON}"
    log "提示：修复问题后，手动将 globalStatus 改为 'running'"

    # 创建暂停标记文件，防止 cron 重复执行
    echo "系统暂停于: $(date)" > "${PAUSE_FILE}"
    echo "原因: ${PAUSE_REASON}" >> "${PAUSE_FILE}"

    exit 0
fi

# 4. 执行 auto-dev-runner.cjs
log "🚀 开始执行自动化开发任务"
log "超时时间: ${TIMEOUT}秒"
echo ""

cd "${SCRIPT_DIR}"

# 使用 timeout 命令限制执行时间
if command -v timeout &> /dev/null; then
    timeout ${TIMEOUT} node auto-dev-runner.cjs
    EXIT_CODE=$?
else
    # 如果没有 timeout 命令，直接执行（有风险）
    log_warning "未找到 timeout 命令，无法限制执行时间"
    node auto-dev-runner.cjs
    EXIT_CODE=$?
fi

# 5. 处理退出码
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${EXIT_CODE} -eq 0 ]; then
    log_success "执行成功"
elif [ ${EXIT_CODE} -eq 2 ]; then
    log_warning "系统已暂停（需人工介入）"
    # 创建暂停标记
    echo "系统暂停于: $(date)" > "${PAUSE_FILE}"
elif [ ${EXIT_CODE} -eq 124 ]; then
    log_error "执行超时（${TIMEOUT}秒）"
else
    log_error "执行失败（退出码: ${EXIT_CODE}）"
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit ${EXIT_CODE}
