# 自动化开发系统

AI驱动的自动化开发引擎，支持从Markdown任务清单自动完成41个开发任务。

## 📁 目录结构

```
/home/ccp/auto/
├── 核心执行文件
│   ├── auto-dev-runner.cjs       # 主调度器（480行）
│   ├── feishu-notifier.cjs       # 飞书通知器（361行）
│   ├── task-parser.cjs           # 任务解析器（183行）
│   ├── auto-dev.sh               # Shell入口脚本
│   ├── setup-cron.sh             # Cron配置脚本
│   ├── check-env.sh              # 环境检查脚本
│   ├── status.sh                 # 状态查询脚本
│   └── test-auto-dev.sh          # 测试脚本
│
├── 数据和配置
│   ├── task.md                   # 任务清单（41个任务）
│   ├── task-state.json           # 状态追踪（运行时生成）
│   └── task-state.schema.json    # 状态文件Schema
│
├── 提示词模板
│   └── prompts/
│       ├── level-0-friendly.txt  # Level 0：友好模式
│       ├── level-1-retry.txt     # Level 1：重试模式
│       ├── level-2-strict.txt    # Level 2：严格模式
│       └── level-3-pua.txt       # Level 3：PUA模式
│
├── 日志
│   └── logs/
│       ├── cron.log              # Cron执行日志
│       └── [timestamp].log       # Claude执行日志
│
├── Bull队列系统（可选）
│   └── bull/
│       ├── worker.js             # Bull Worker入口
│       ├── package.json          # 独立依赖配置
│       ├── config/               # 配置文件
│       └── lib/                  # 核心库
│
└── 文档
    ├── README.md                 # 本文件
    ├── AUTO-DEV-README.md        # 详细使用文档
    ├── QUICKSTART.md             # 快速开始指南
    └── SUMMARY.md                # 系统总结
```

## 🚀 快速开始

### 1. 环境准备

```bash
cd /home/ccp/auto

# 检查环境
./check-env.sh

# 设置环境变量（可选，用于飞书通知）
export FeishuCC_App_ID=cli_xxxxx
export FeishuCC_App_Secret=xxxxx
export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx
```

### 2. 解析任务清单

```bash
# 从task.md生成task-state.json
node task-parser.cjs
```

### 3. 手动执行一次

```bash
# 测试运行
./auto-dev.sh
```

### 4. 配置定时任务

```bash
# 配置每10分钟自动执行
./setup-cron.sh

# 选择 [1] 启用自动化
```

### Boundy Codex 任务（可选）

```bash
# 手动执行一次
node boundy-runner.mjs

# 配置每10分钟执行（选择 Boundy Codex）
CRON_TARGET=boundy ./setup-cron.sh
```

状态文件保存在 `boundy-state.json`，暂停执行可创建 `.boundy-pause`。

## 📊 监控和控制

### 查看进度

```bash
# 查看当前进度
node -e "const s=require('./task-state.json'); \
  console.log('进度:', s.currentTaskIndex+1, '/', s.tasks.length)"

# 查看详细状态
./status.sh
```

### 查看日志

```bash
# 查看Cron日志
tail -f logs/cron.log

# 查看最新执行日志
tail -f $(ls -t logs/*.log | head -1)
```

### 控制命令

```bash
# 暂停自动化
touch .auto-dev-pause

# 恢复自动化
rm .auto-dev-pause

# 手动执行一次
./auto-dev.sh
```

## 🔧 系统特性

- ✅ **完全独立**：不依赖任何外部系统，可独立部署
- ✅ **智能重试**：4级提示词策略（友好→重试→严格→PUA）
- ✅ **飞书通知**：实时通知任务状态（可选）
- ✅ **状态持久化**：完整的执行历史记录
- ✅ **容错设计**：自动暂停、错误恢复
- ✅ **Bull队列**：支持分布式任务调度（可选）

## 📈 文件统计

- **核心代码**: ~1000行（CJS）
- **提示词模板**: 4个文件
- **文档**: 4个文件
- **总计**: 21个文件/目录

## 🔗 相关文档

- [详细使用文档](./AUTO-DEV-README.md) - 完整的系统说明
- [快速开始](./QUICKSTART.md) - 5分钟快速启动
- [系统总结](./SUMMARY.md) - 实施总结和统计

## 💡 技术亮点

1. **零耦合**：不依赖主程序，完全独立运行
2. **智能调度**：基于依赖关系自动排序任务
3. **提示词迭代**：失败后自动升级提示词严厉程度
4. **飞书集成**：5种事件通知（开始、完成、失败、暂停、全部完成）
5. **Bull增强**：可选的分布式任务队列支持

## 🐛 故障排查

### 问题：任务执行失败

```bash
# 1. 查看错误日志
ls -lt logs/*.log | head -1

# 2. 检查task-state.json
grep -A 5 "blocked" task-state.json

# 3. 手动修复后恢复
rm .auto-dev-pause
```

### 问题：Cron未执行

```bash
# 检查crontab配置
crontab -l | grep auto-dev

# 查看cron日志
tail -50 logs/cron.log
```

## 📞 获取帮助

1. 查看[详细文档](./AUTO-DEV-README.md)的故障排查章节
2. 运行测试脚本：`./test-auto-dev.sh`
3. 检查环境：`./check-env.sh`

---

**系统版本**: v1.0.0
**最后更新**: 2024-11-24
**位置**: /home/ccp/auto
**状态**: ✅ 已独立部署，可正常使用
