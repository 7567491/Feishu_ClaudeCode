# 飞书机器人架构变更：WebSocket → HTTP Webhook

## 变更日期
2025-12-13

## 变更原因
用户在飞书开放平台配置为"将事件发送至开发者服务器"（HTTP回调模式），但本地运行的是 WebSocket 长连接服务，导致事件订阅模式与运行服务不匹配，机器人无法收到消息。

## 方案选择
选择**方案 B：切换到 HTTP Webhook 模式**

理由：
- 已具备完整基础设施（公网域名、SSL、反向代理）
- Webhook 代码已完整实现（`server/feishu-webhook.js`）
- 适合未来多实例扩展和生产高可用
- 无状态架构，易于维护和监控

## 主要变更

### 1. 删除的文件
- ❌ `server/feishu-ws.js` - WebSocket 长连接服务
- ❌ `test/feishu/diagnose-ws-connection.js` - WebSocket 诊断工具

### 2. 修改的文件

#### `package.json`
```diff
- "feishu": "node server/feishu-ws.js",
```

#### `CLAUDE.md`
- 更新项目概览：2个核心服务（原3个）
- 更新部署命令：移除独立的飞书服务启动
- 更新架构描述：WebSocket → HTTP Webhook
- 更新文件路径速查表

#### PM2 配置
```bash
pm2 stop feishu
pm2 delete feishu
pm2 save
```

### 3. 当前架构

**服务拓扑：**
```
飞书服务器 →HTTPS POST→ Nginx(443) →HTTP→ Express(33300) → feishu-webhook.js
                                           ↓
                                      处理消息事件
```

**关键端点：**
- Webhook URL: `https://ccode.linapp.fun/webhook`
- 本地端口: `33300`
- 处理器: `server/feishu-webhook.js:createWebhookHandler()`

## 验证结果

### 1. URL 验证测试
```bash
curl -X POST https://ccode.linapp.fun/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test123","token":"test"}'

# 响应: {"challenge":"test123"} ✅
```

### 2. 事件接收测试
```bash
# 发送模拟消息事件
# 日志显示：[debug]: [ 'execute im.message.receive_v1 handle' ] ✅
```

### 3. 服务状态
```bash
pm2 list
# ✅ claude-code-ui (index.js) - 运行中，已包含 Webhook 处理器
# ❌ feishu - 已删除
```

## 飞书开放平台配置要求

**必须配置：**
1. **订阅方式**：将事件发送至开发者服务器
2. **请求地址**：`https://ccode.linapp.fun/webhook`
3. **订阅事件**：
   - ✅ `im.message.receive_v1` (接收消息 v2.0)
4. **权限要求**：
   - ✅ `im.message.receive_v1` - 接收群聊中@机器人消息事件
   - ✅ `im.message` - 读取用户发给机器人的单聊消息

## 优势对比

### WebSocket 模式（已移除）
- ✅ 零配置部署
- ✅ 防火墙友好
- ❌ 单进程限制
- ❌ 需要保持长连接

### HTTP Webhook 模式（当前）
- ✅ 无状态架构，易扩展
- ✅ 标准 HTTP，易监控
- ✅ 云原生友好
- ✅ 已有完整基础设施
- ⚠️ 需要公网访问（已具备）

## 后续维护

### 日志查看
```bash
pm2 logs claude-code-ui --lines 50 | grep -i "feishu\|webhook"
```

### 重启服务
```bash
pm2 restart claude-code-ui
```

### 测试 Webhook
```bash
curl -X POST https://ccode.linapp.fun/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test","token":"test"}'
```

## 相关文档
- 飞书开放平台文档：https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN
- 项目文档：`CLAUDE.md`
- Webhook 实现：`server/feishu-webhook.js`

## 变更完成
✅ 所有 WebSocket 相关代码已删除
✅ HTTP Webhook 模式已验证可用
✅ 文档已更新完成
✅ PM2 配置已保存

---
**负责人**: Claude Code
**审核状态**: 已完成
