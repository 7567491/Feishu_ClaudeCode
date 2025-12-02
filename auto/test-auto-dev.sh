#!/bin/bash

##############################################################################
# test-auto-dev.sh - 自动化开发系统测试工具
#
# 功能：
# 1. 快速测试系统各个组件
# 2. 模拟成功/失败场景
# 3. 验证提示词生成
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_success() { echo -e "${GREEN}[TEST]${NC} ✅ $1"; }
log_error() { echo -e "${RED}[TEST]${NC} ❌ $1"; }
log_warning() { echo -e "${YELLOW}[TEST]${NC} ⚠️  $1"; }

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🧪 自动化开发系统测试${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "${SCRIPT_DIR}"

# 测试1: 检查文件
log "1. 检查文件结构..."
files=(
    "task.md"
    "need.md"
    "design.md"
    "task-parser.cjs"
    "auto-dev-runner.cjs"
    "auto-dev.sh"
    "feishu-notifier.cjs"
    "prompts/level-0-friendly.txt"
    "prompts/level-1-retry.txt"
    "prompts/level-2-strict.txt"
    "prompts/level-3-pua.txt"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (缺失)"
        all_exist=false
    fi
done

if [ "$all_exist" = false ]; then
    log_error "部分文件缺失"
    exit 1
fi
log_success "所有文件存在"
echo ""

# 测试2: 解析任务
log "2. 测试任务解析..."
if [ -f "task-state.json" ]; then
    log_warning "task-state.json 已存在，备份..."
    cp task-state.json task-state.json.backup
fi

node task-parser.cjs > /dev/null 2>&1
if [ $? -eq 0 ]; then
    task_count=$(node -e "console.log(require('./task-state.json').tasks.length)")
    log_success "任务解析成功，共 ${task_count} 个任务"
else
    log_error "任务解析失败"
    exit 1
fi
echo ""

# 测试3: 状态文件验证
log "3. 验证状态文件结构..."
node -e "
const s = require('./task-state.json');
const required = ['version', 'globalStatus', 'currentTaskIndex', 'tasks'];
const missing = required.filter(k => !(k in s));
if (missing.length > 0) {
  console.log('❌ 缺少字段:', missing.join(', '));
  process.exit(1);
}
console.log('✅ 状态文件结构正确');
"
echo ""

# 测试4: 提示词生成
log "4. 测试提示词生成..."
node -e "
const AutoDevRunner = require('./auto-dev-runner.cjs');
const runner = new AutoDevRunner();
runner.loadState();
const task = runner.getCurrentTask();
if (!task) {
  console.log('❌ 无法获取当前任务');
  process.exit(1);
}
runner.generatePrompt(task).then(prompt => {
  console.log('✅ 提示词生成成功，长度:', prompt.length, '字符');
  console.log('   包含任务标题:', prompt.includes(task.title) ? '✅' : '❌');
  console.log('   包含文档引用:', prompt.includes('need.md') ? '✅' : '❌');
}).catch(err => {
  console.log('❌ 提示词生成失败:', err.message);
  process.exit(1);
});
"
echo ""

# 测试5: 飞书通知（如果配置）
log "5. 测试飞书通知..."
if [ -n "$FEISHU_NOTIFY_RECEIVE_ID" ]; then
    log "   接收者ID: $FEISHU_NOTIFY_RECEIVE_ID"
    log "   发送测试通知..."

    node -e "
    const FeishuNotifier = require('./feishu-notifier.cjs');
    const notifier = new FeishuNotifier();
    const mockTask = {
      id: 'test-task',
      title: '测试任务（自动化开发系统测试）',
      stage: 0,
      retryCount: 0,
      attempts: []
    };
    const mockState = {
      currentTaskIndex: 0,
      tasks: [mockTask],
      totalAttempts: 0
    };
    notifier.notifyTaskStart(mockTask, mockState).then(success => {
      if (success) {
        console.log('✅ 飞书通知发送成功');
      } else {
        console.log('⚠️  飞书通知发送失败（可能是网络或凭证问题）');
      }
    });
    " &
    wait
else
    log_warning "未配置 FEISHU_NOTIFY_RECEIVE_ID，跳过飞书通知测试"
    log "   设置方法: export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx"
fi
echo ""

# 测试6: 检查依赖
log "6. 检查系统依赖..."

# 检查 Node.js
if command -v node &> /dev/null; then
    node_version=$(node --version)
    log_success "Node.js: $node_version"
else
    log_error "Node.js 未安装"
    exit 1
fi

# 检查 claude CLI
if command -v claude &> /dev/null; then
    claude_version=$(claude --version 2>&1 | head -1)
    log_success "Claude CLI: $claude_version"
else
    log_error "Claude CLI 未安装或不在 PATH 中"
    exit 1
fi

# 检查 npm 包
if node -e "require('@larksuiteoapi/node-sdk')" 2>/dev/null; then
    log_success "飞书 SDK 已安装"
else
    log_error "飞书 SDK 未安装"
    log "   安装命令: npm install @larksuiteoapi/node-sdk"
    exit 1
fi

echo ""

# 测试总结
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ 所有测试通过！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "📝 下一步操作："
echo ""
echo "1. 手动测试单次执行："
echo "   ./auto-dev.sh"
echo ""
echo "2. 查看生成的提示词（可选）："
echo "   node -e \"const r=require('./auto-dev-runner.cjs'); const runner=new r(); runner.loadState(); runner.generatePrompt(runner.getCurrentTask()).then(console.log)\""
echo ""
echo "3. 配置定时任务（每10分钟）："
echo "   ./setup-cron.sh"
echo ""
echo "4. 监控执行日志："
echo "   tail -f logs/cron.log"
echo ""

# 恢复备份（如果有）
if [ -f "task-state.json.backup" ]; then
    log "恢复状态文件备份..."
    mv task-state.json.backup task-state.json
fi
