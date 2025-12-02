# 飞书机器人集成 Claude Code 需求文档

## 核心目标
在现有 Claude Code UI 基础上，新增飞书机器人接入能力。**最大化复用现有代码（95%集成度）**，确保系统一致性。

## 功能需求

### 1. 飞书接入
- 使用 `@larksuiteoapi/node-sdk` 的 **WSClient 长连接**（无需公网域名）
- 支持私聊消息、群聊 @ 消息，自动断线重连
- 参考已验证代码：`feishu/test-feishu-ws.js`, `test-send-message.js`

### 2. 会话隔离
- 私聊：`user-{open_id}` → `./feicc/user-xxx/`
- 群聊：`group-{chat_id}` → `./feicc/group-xxx/`
- **集成到 `server/projects.js`**，Web UI 项目列表可见

### 3. 数据持久化
- **扩展 `server/database/db.js`**（不创建新文件）
- 新增表：`feishu_sessions`, `feishu_message_log`
- 导出 `feishuDb` 模块（类似 `credentialsDb`）

### 4. 凭证管理
- **使用 `credentialsDb`**（不用环境变量）
- 凭证类型：`'feishu'`，支持多用户、多机器人

### 5. 消息处理
- **完全复用 `queryClaude()`**（`server/claude-cli.js`）
- 实现 `FeishuMessageWriter` 类（兼容 `ws.send()` 接口）
- 流式响应：每 2000 字符或 3 秒发送一段
- **复用 `isClaudeSessionActive()` 做并发控制**

### 6. Web UI 管理
- REST API：`/api/feishu/*`（需认证）
- 凭证配置、会话列表、统计仪表板、服务控制

## 技术架构

### 新增模块
```
server/
├── database/db.js           # 扩展：添加 feishuDb
├── feishu-ws.js             # 新增：主服务入口
├── lib/
│   ├── feishu-client.js     # 新增：Lark SDK 封装
│   ├── feishu-session.js    # 新增：会话管理
│   └── feishu-message-writer.js  # 新增：消息写入器
└── routes/feishu.js         # 新增：REST API
```

### 复用的现有代码
| 模块 | 文件 | 复用方式 |
|------|------|---------|
| Claude 对话 | `claude-cli.js` | `queryClaude()`, `isClaudeSessionActive()` |
| 数据库 | `database/db.js` | 扩展表结构，复用连接 |
| 凭证管理 | `database/db.js` | `credentialsDb.getActiveCredential()` |
| 项目管理 | `projects.js` | `addProjectManually()` |
| 认证 | `middleware/auth.js` | `authenticateToken` |

### 关键设计
1. **FeishuMessageWriter** 实现 `ws.send()` 接口 → 无缝对接 `queryClaude()`
2. **数据库扩展** 在 `db.js` 末尾添加表和操作函数
3. **凭证存储** `credentialsDb.createCredential(userId, 'feishu', JSON.stringify({appId, appSecret, ...}))`
4. **项目注册** `addProjectManually(projectPath, displayName)` → Web UI 可见

## 部署说明

### 飞书配置
1. 开放平台创建应用，申请权限：`im:message`, `im:message.group_at_msg`
2. 启用"长连接模式"，订阅事件：`im.message.receive_v1`

### 启动方式
```bash
npm run feishu  # 独立进程

# 或集成到主服务（server/index.js）
import { feishuService } from './feishu-ws.js';
feishuService.start();
```

### 无需配置
❌ 公网域名 ❌ Nginx ❌ Webhook URL ❌ 环境变量

## 集成度对比

| 模块 | 集成度 | 模块 | 集成度 |
|------|--------|------|--------|
| Claude 对话 | 100% | 凭证管理 | 100% |
| 数据库 | 95% | 日志系统 | 100% |
| 项目管理 | 90% | **总体** | **95%** |
| 认证系统 | 100% | | |

---
**修订**：v2.0 (2024-11-24) - 最大化代码复用，95%集成度
