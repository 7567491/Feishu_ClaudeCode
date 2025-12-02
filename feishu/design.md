# 飞书机器人架构设计文档

## 设计原则
**最大化代码复用** | **最小侵入性** | **统一性**

## 系统架构
```
现有系统 (db.js, claude-cli.js, projects.js)
   ↓ 共享
新增模块 (feishu-ws.js, lib/feishu-*.js)
   ↓ WSClient 长连接
飞书服务器
```

## 核心模块

### 1. 数据库扩展 (server/database/db.js)
末尾添加：`feishu_sessions` 表、`feishu_message_log` 表、`export const feishuDb`

### 2. 飞书客户端 (server/lib/feishu-client.js)
```javascript
export class FeishuClient {
  constructor(config) { /* Client + WSClient */ }
  async start(messageHandler) { /* 监听 im.message.receive_v1 */ }
  isMessageForBot(event) { /* 私聊或群聊@ */ }
  async sendTextMessage(chatId, text) { /* 发送 */ }
}
```

### 3. 消息写入器 (server/lib/feishu-message-writer.js)
**关键**：实现 `ws.send()` 接口
```javascript
export class FeishuMessageWriter {
  send(data) { /* 解析 queryClaude 输出，累积 buffer */ }
  async flush() { /* 每 2000 字符或 3 秒发送 */ }
  async complete() { /* 发送剩余 + ✅ */ }
}
```

### 4. 会话管理器 (server/lib/feishu-session.js)
```javascript
export class FeishuSessionManager {
  async getOrCreateSession(event) {
    // 查询 → 不存在则创建目录 + git init + addProjectManually() + 写数据库
  }
  isSessionBusy(session) { return isClaudeSessionActive(session.claude_session_id); }
}
```

### 5. 主服务 (server/feishu-ws.js)
```javascript
class FeishuService {
  async start() { /* 获取凭证 → FeishuClient → 启动连接 */ }
  async handleMessage(event, userText) {
    const session = await sessionManager.getOrCreateSession(event);
    if (sessionManager.isSessionBusy(session)) return sendMessage('⏳');

    const writer = new FeishuMessageWriter(client, chatId);
    await queryClaude(userText, { cwd: session.project_path, ... }, writer);
    await writer.complete();
  }
}
```

### 6. REST API (server/routes/feishu.js)
`GET /status`, `POST /start|stop`, `GET /sessions`, `GET /stats`

## 集成

**server/index.js**: `app.use('/api/feishu', authenticateToken, feishuRoutes);`

**package.json**: `"feishu": "node server/feishu-ws.js"`

## 关键技术点

### 1. 无缝对接 queryClaude()
```javascript
await queryClaude(prompt, options, feishuMessageWriter);
// writer.send({type, data}) → 累积 → 发送飞书
```

### 2. 凭证管理
```javascript
credentialsDb.createCredential(userId, 'feishu', JSON.stringify({appId, appSecret}));
```

### 3. 项目注册
```javascript
await addProjectManually('./feicc/user-xxx/', '飞书私聊-xxx');
```

## 技术亮点
1. **95% 代码复用** - queryClaude, db.js, projects.js, auth
2. **零运维** - 无需域名、Nginx、Webhook
3. **会话隔离** - 独立目录、持久化、并发控制
4. **流式体验** - 实时输出、智能分片

---
**修订**：v2.0 (2024-11-24) - 集成度 95%
