# 🚀 快速开始指南

## 5分钟启动自动化开发系统

### 前提条件

✅ Node.js >= 14
✅ Claude CLI 已安装
✅ 飞书 SDK 已安装（`@larksuiteoapi/node-sdk`）

### 步骤1: 检查环境配置（30秒）

```bash
cd /home/ccp/feishu
./check-env.sh
```

**预期输出**:
- ✅ FeishuCC_App_ID: 已设置
- ✅ FeishuCC_App_Secret: 已设置
- ⚠️ FEISHU_NOTIFY_RECEIVE_ID: 未设置（可选）

### 步骤2: 测试系统（1分钟）

```bash
./test-auto-dev.sh
```

**预期输出**: ✅ 所有测试通过

### 步骤3: 配置飞书通知（可选，1分钟）

**系统已自动检测到飞书环境变量**：
- ✅ `FeishuCC_App_ID` - 已设置
- ✅ `FeishuCC_App_Secret` - 已设置

**仅需配置通知接收者**：

```bash
# 获取你的 open_id
node test-feishu-ws.js
# 飞书中给机器人发消息，控制台显示 open_id

# 设置接收者环境变量
export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx

# 永久保存到 ~/.bashrc
echo 'export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx' >> ~/.bashrc
source ~/.bashrc
```

### 步骤4: 手动测试一次（2分钟）

```bash
./auto-dev.sh
```

**这将**：
1. 读取 need.md, design.md, task.md
2. 执行第一个任务
3. 生成日志到 `logs/`
4. 发送飞书通知（如果配置）

**观察输出**，确保 Claude CLI 正常工作。

### 步骤5: 启用自动化（1分钟）

```bash
./setup-cron.sh
# 选择 1 添加 cron 任务
```

**完成！** 系统将每10分钟自动执行一次任务。

---

## 监控与控制

### 查看实时日志

```bash
# Cron 日志
tail -f logs/cron.log

# 最新 Claude 执行日志
tail -f $(ls -t logs/*.log | head -1)
```

### 查看进度

```bash
node -e "const s=require('./task-state.json'); console.log('进度:', s.currentTaskIndex+1, '/', s.tasks.length, '- 状态:', s.globalStatus)"
```

### 暂停自动化

```bash
touch .auto-dev-pause
```

### 恢复自动化

```bash
rm .auto-dev-pause
```

---

## 预期时间表

| 阶段 | 任务数 | 预计时间 |
|------|--------|---------|
| 阶段 0: 准备 | 3 | 10分钟 |
| 阶段 1: 数据库扩展 | 3 | 30分钟 |
| 阶段 2: 消息写入器 | 5 | 1小时 |
| 阶段 3: 飞书客户端 | 4 | 1小时 |
| 阶段 4: 会话管理器 | 5 | 1小时 |
| 阶段 5: 主服务 | 6 | 1.5小时 |
| 阶段 6: REST API | 3 | 30分钟 |
| 阶段 7: 集成 | 2 | 15分钟 |
| 阶段 8: 测试 | 10 | 30分钟 |
| **总计** | **41** | **~6小时** |

每10分钟执行一次 = 最快36次执行（6小时）

---

## 故障排查

### 问题1: Claude CLI 找不到

```bash
which claude
# 如果为空，添加到 PATH 或修改 crontab
```

### 问题2: 任务一直失败

```bash
# 查看最新日志
ls -lt logs/*.log | head -1
cat <最新日志文件>

# 手动测试 Claude 命令
claude --dangerously-skip-permissions -p "测试"
```

### 问题3: 飞书通知不发送

```bash
# 测试飞书通知
node feishu-notifier.cjs

# 检查环境变量
echo $FEISHU_NOTIFY_RECEIVE_ID
```

---

## 完成后

系统完成所有41个任务后：

```bash
# 1. 启动飞书服务
npm run feishu

# 2. 飞书中给机器人发消息测试

# 3. 检查 Web UI 项目列表
```

---

**详细文档**: 查看 `AUTO-DEV-README.md`

**问题反馈**: 检查 `logs/` 目录中的日志文件
