# 飞书机器人集成任务清单

## 阶段 0: 准备 (10分钟)
- [ ] 确认 Node.js >= 14, SDK 已安装
- [ ] 研究 `db.js` (credentialsDb), `claude-cli.js` (queryClaude), `projects.js` (addProjectManually)
- [ ] 测试：`node feishu/test-feishu-ws.js`

## 阶段 1: 数据库扩展 (30分钟)
- [ ] 打开 `server/database/db.js`，在末尾添加表和索引
- [ ] 实现 `feishuDb = { getSession, createSession, updateSessionActivity, getAllSessions, logMessage }`
- [ ] 导出并重启服务检查

## 阶段 2: 消息写入器 (1小时)
- [ ] 创建 `server/lib/feishu-message-writer.js`
- [ ] 实现 `send(data)` - 解析 queryClaude 输出，累积 buffer
- [ ] 实现 `flushIfNeeded()` - 每 2000 字符或 3 秒触发
- [ ] 实现 `flush()` - splitMessage 分片发送
- [ ] 实现 `complete()` - flush + "✅"

## 阶段 3: 飞书客户端 (1小时)
- [ ] 创建 `server/lib/feishu-client.js`
- [ ] 实现构造函数、`start(messageHandler)`、`isMessageForBot(event)`
- [ ] 实现 `sendTextMessage(chatId, text, retries=3)`
- [ ] 测试：启动并发送消息

## 阶段 4: 会话管理器 (1小时)
- [ ] 创建 `server/lib/feishu-session.js`
- [ ] 实现 `getConversationId(event)` - 返回 user-xxx 或 group-xxx
- [ ] 实现 `getOrCreateSession(event)` - 查询 → 创建目录 + git init + addProjectManually + 写数据库
- [ ] 实现 `isSessionBusy(session)` - 调用 isClaudeSessionActive
- [ ] 测试：模拟事件，检查目录和数据库

## 阶段 5: 主服务 (1.5小时)
- [ ] 创建 `server/feishu-ws.js`
- [ ] 实现 `loadConfig()` - 从 credentialsDb 获取凭证
- [ ] 实现 `start()` - loadConfig → FeishuClient → 启动连接
- [ ] 实现 `handleMessage(event, userText)`:
  - getOrCreateSession → 检查并发 → FeishuMessageWriter
  - queryClaude → complete → 更新数据库
- [ ] 实现 `getStatus()`, `stop()`, 主程序入口, SIGINT/SIGTERM
- [ ] 测试：`node server/feishu-ws.js`，飞书发送消息

## 阶段 6: REST API (30分钟)
- [ ] 创建 `server/routes/feishu.js`
- [ ] 实现：`GET /status`, `POST /start|stop`, `GET /sessions`, `DELETE /sessions/:id`, `GET /stats`, `GET /health`
- [ ] 导出 router

## 阶段 7: 集成 (15分钟)
- [ ] 修改 `server/index.js` - 导入并挂载 `/api/feishu` 路由
- [ ] 修改 `package.json` - 添加 `"feishu": "node server/feishu-ws.js"`

## 阶段 8: 测试 (30分钟)
- [ ] 启动服务：`npm run feishu`
- [ ] 测试私聊、群聊@、会话隔离、并发控制、长消息分片
- [ ] 测试 Web UI 项目列表、REST API
- [ ] 检查数据库表

## 验收清单
- [ ] 私聊和群聊@正常响应
- [ ] 会话隔离正确
- [ ] 长消息分片、并发控制有效
- [ ] 飞书项目在 Web UI 可见
- [ ] 数据库表正确、REST API 正常
- [ ] 优雅启动和关闭

---
**预计总时间**: 6小时 | **提示**: 每阶段完成后立即测试
