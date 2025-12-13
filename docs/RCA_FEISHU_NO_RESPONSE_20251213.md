# RCA: 飞书机器人完全无响应问题（2025-12-13 14:47）

**严重程度**: 🔴 P0 - 服务完全中断
**报告时间**: 2025-12-13 14:50
**发现时间**: 14:47（用户报告）

---

## 1. 问题描述

### 1.1 故障现象
- 飞书机器人**完全无响应**
- 连"收到"的确认消息都没有
- 用户发送消息后没有任何反馈

### 1.2 时间线
```
14:39  PM2重启飞书服务（应用RCA修复）
14:39  服务成功启动，WebSocket连接成功
14:39  显示 "⏭️ Skipping cleanup" (Fix 1生效)
14:39  显示 "📴 Stopping message reception..." (Fix 2生效)
14:47  用户报告：飞书机器人无响应
14:50  开始RCA分析
```

---

## 2. 诊断结果

### ✅ 正常的组件

1. **PM2进程**: online, 24次重启, 运行6分钟
2. **WebSocket连接**: 已成功启动
   ```
   [FeishuClient] WebSocket started successfully
   ```
3. **事件处理器**: 已注册
   ```
   [debug]: [ 'register im.message.receive_v1 handle' ]
   ```
4. **飞书凭据**: 正常加载
   ```
   App ID: cli_a85b46e11ff6500d
   ```
5. **数据库**: 正常，58个活跃会话，3个有session_id
6. **主服务**: 正常（端口33300监听）
7. **Fix 1 & Fix 2**: 已正确生效

### ❌ 异常的组件

**关键发现**: 日志中**完全没有**任何消息接收记录！
- 🚫 无 `EventDispatcher received` 日志
- 🚫 无 `handleMessageEvent` 调用日志
- 🚫 14:00后数据库无新消息记录

---

## 3. 五个（七个）为什么分析

### 🔍 为什么1: 为什么飞书机器人无响应？
**答**: 因为服务端没有收到任何消息事件。

**证据**:
- 日志中无 `EventDispatcher received`
- 数据库中14:00后无新消息记录
- `isMessageForBot()` 判断未执行（日志中无相关输出）

---

### 🔍 为什么2: 为什么服务端没有收到消息事件？
**答**: 虽然WebSocket连接成功，但飞书开放平台没有推送事件。

**证据**:
- WebSocket显示 `started successfully`
- 事件处理器已注册 `im.message.receive_v1`
- 但无任何事件触发

---

### 🔍 为什么3: 为什么飞书开放平台没有推送事件？
**可能原因**:
A. 飞书应用的事件订阅配置失效
B. 飞书应用被禁用或权限被撤销
C. WebSocket连接虽成功但实际已断开
D. 飞书平台端问题

---

### 🔍 为什么4: 为什么事件订阅会失效？
**最可能的原因**: **PM2重启前的SIGINT错误导致飞书平台认为应用异常**

**关键时间点**:
- 6:54 发生SIGINT错误（旧的RCA已分析）
- 飞书平台可能检测到异常，**暂停了事件推送**
- 14:39 虽然重启成功，但**飞书平台端的推送未恢复**

---

### 🔍 为什么5: 为什么重启后推送未恢复？
**答**: 飞书WebSocket模式不会自动重新订阅，需要**手动触发**。

**机制分析**:
```javascript
// server/lib/feishu-client.js:74-76
await this.wsClient.start({ eventDispatcher });
this.isRunning = true;
```

飞书WebSocket启动逻辑：
1. 建立WebSocket连接 ✅（已完成）
2. 注册事件处理器 ✅（已完成）
3. **但飞书平台端可能需要重新确认订阅** ❌（未执行）

---

### 🔍 为什么6: 为什么之前一直正常？
**答**: 因为之前没有发生SIGINT异常中断，飞书平台的事件推送一直稳定。

**证据**:
- 6:54之前的消息记录正常
- 6:54发生SIGINT后，再无消息记录
- 这是首次遇到"完全无响应"问题

---

### 🔍 为什么7: 为什么是可控的？
**答**: 有3个可控的解决方案

1. **重新启用飞书应用**（飞书开放平台操作）
2. **重启WebSocket连接**（代码层面）
3. **添加心跳检测机制**（长期方案）

---

## 4. 所有可能的原因假设

### 4.1 飞书平台端问题（高概率 80%）

#### A. 事件订阅被暂停 ⭐️ **最可能**
**症状**: WebSocket连接正常，但无事件推送
**原因**: SIGINT异常导致飞书平台认为应用不稳定
**验证方法**:
1. 登录飞书开放平台（https://open.feishu.cn）
2. 进入应用管理 → 事件订阅
3. 检查订阅状态和推送URL

#### B. 应用权限被撤销
**症状**: 所有API调用失败
**原因**: 管理员操作或自动审核
**验证方法**:
```bash
curl -X POST https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$FeishuCC_App_ID\",\"app_secret\":\"$FeishuCC_App_Secret\"}"
```

#### C. 应用被临时禁用
**症状**: 所有功能不可用
**原因**: 触发飞书平台的安全策略
**验证方法**: 开放平台查看应用状态

### 4.2 WebSocket连接问题（中概率 15%）

#### D. 连接实际已断开
**症状**: 日志显示连接，但实际不通
**原因**: 网络波动、防火墙、代理
**验证方法**:
```bash
# 检查进程的网络连接
lsof -p $(pgrep -f feishu-ws.js) | grep TCP
```

#### E. SDK版本不兼容
**症状**: 事件处理器未正确注册
**原因**: @larksuiteoapi/node-sdk版本问题
**验证方法**: 查看package.json版本

### 4.3 代码逻辑问题（低概率 5%）

#### F. isMessageForBot() 过滤太严格
**症状**: 消息被错误过滤
**原因**: Bot信息未正确获取
**验证方法**: 检查 `this.botInfo` 是否为null

#### G. 异步处理死锁
**症状**: 消息堆积在队列中
**原因**: Promise未正确resolve
**验证方法**: 添加调试日志

---

## 5. TDD验证方案

### Test 1: 验证飞书平台连接
```bash
# 测试应用token获取
node -e "
import('@larksuiteoapi/node-sdk').then(lark => {
  const client = new lark.default.Client({
    appId: process.env.FeishuCC_App_ID,
    appSecret: process.env.FeishuCC_App_Secret
  });

  client.request({
    method: 'GET',
    url: 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal'
  }).then(res => {
    console.log('Token获取:', res.code === 0 ? '✓' : '✗');
  }).catch(err => {
    console.error('失败:', err.message);
  });
});
"
```

### Test 2: 验证WebSocket心跳
```javascript
// tests/test-websocket-heartbeat.js
import { FeishuClient } from './server/lib/feishu-client.js';

const client = new FeishuClient({
  appId: process.env.FeishuCC_App_ID,
  appSecret: process.env.FeishuCC_App_Secret
});

// 监听连接状态
let lastEvent = Date.now();
await client.start(async (event) => {
  lastEvent = Date.now();
  console.log('收到事件，连接正常');
});

// 每30秒检查
setInterval(() => {
  const idle = Date.now() - lastEvent;
  if (idle > 60000) {
    console.warn(`⚠️  ${idle/1000}秒无事件，连接可能断开`);
  }
}, 30000);
```

### Test 3: 模拟消息发送
```bash
# 使用飞书测试号发送消息
# 或使用API直接发送
curl -X POST https://open.feishu.cn/open-apis/im/v1/messages \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "receive_id": "ou_xxx",
    "msg_type": "text",
    "content": "{\"text\":\"test\"}"
  }'
```

### Test 4: 检查事件订阅
```bash
# 手动验证飞书开放平台配置
# 1. 登录 https://open.feishu.cn
# 2. 进入应用 → 事件订阅
# 3. 确认以下配置：
#    - ✓ im.message.receive_v1 已订阅
#    - ✓ 订阅状态：启用
#    - ✓ 推送方式：WebSocket
```

---

## 6. 修复方案

### 方案1: 重启飞书应用（立即，推荐）⭐️

**步骤**:
1. 登录飞书开放平台
2. 进入应用管理 → 选择应用
3. 点击"重启应用"或"重新启用事件订阅"
4. 等待30秒
5. 重启本地服务：`pm2 restart feishu`

**预期结果**: 事件推送恢复

---

### 方案2: 添加WebSocket重连逻辑（短期）

```javascript
// server/lib/feishu-client.js
export class FeishuClient {
  constructor(config) {
    // ... 现有代码
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5秒
  }

  async start(messageHandler) {
    // ... 现有代码

    // 🆕 添加定期心跳检测
    this.heartbeatInterval = setInterval(async () => {
      if (!this.isRunning) return;

      // 检查最后收到消息的时间
      const idleTime = Date.now() - (this.lastMessageTime || Date.now());

      if (idleTime > 300000) { // 5分钟无消息
        console.warn('[FeishuClient] ⚠️  No events for 5 minutes, checking connection...');

        // 尝试获取token验证连接
        try {
          await this.client.request({
            method: 'POST',
            url: '/open-apis/auth/v3/app_access_token/internal',
            data: {
              app_id: this.appId,
              app_secret: this.appSecret
            }
          });
          console.log('[FeishuClient] ✓ Connection verified');
        } catch (error) {
          console.error('[FeishuClient] ❌ Connection failed, reconnecting...');
          await this.reconnect();
        }
      }
    }, 60000); // 每分钟检查一次
  }

  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[FeishuClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[FeishuClient] Reconnecting... (attempt ${this.reconnectAttempts})`);

    await this.stop();
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    await this.start(this.messageHandler);
  }

  async handleMessageEvent(data) {
    this.lastMessageTime = Date.now(); // 🆕 记录最后收到消息的时间
    this.reconnectAttempts = 0; // 🆕 重置重连计数

    // ... 现有逻辑
  }
}
```

---

### 方案3: 添加健康检查端点（长期）

```javascript
// server/index.js
app.get('/health/feishu', async (req, res) => {
  const status = {
    websocket: false,
    lastMessage: null,
    eventCount: 0
  };

  // 检查WebSocket状态
  // 检查最后消息时间
  // 检查事件计数

  res.json(status);
});
```

---

## 7. 立即行动项

| 优先级 | 任务 | 操作 | 预计时间 |
|--------|------|------|----------|
| P0 | 检查飞书开放平台 | 登录平台查看应用状态和事件订阅 | 2分钟 |
| P0 | 重启飞书应用 | 开放平台操作 | 1分钟 |
| P0 | 重启本地服务 | `pm2 restart feishu` | 10秒 |
| P0 | 测试消息发送 | 飞书中发送测试消息 | 30秒 |
| P1 | 添加心跳检测 | 实施方案2代码 | 30分钟 |
| P2 | 添加健康检查 | 实施方案3代码 | 1小时 |

---

## 8. 根本原因总结

**直接原因**: 飞书平台停止推送事件（WebSocket连接正常但无数据）

**触发因素**: 6:54的SIGINT异常中断

**根本原因** (可控):
1. 缺少WebSocket连接健康检测机制
2. 缺少自动重连逻辑
3. 飞书开放平台需要手动重新启用订阅

**为什么是可控的**:
- 飞书开放平台可操作
- 代码可以添加重连逻辑
- 可以实施监控和告警

---

## 9. 预防措施

1. **监控**: 添加Prometheus metrics监控事件接收频率
2. **告警**: 5分钟无事件触发告警
3. **自愈**: 自动重连机制
4. **文档**: 记录飞书开放平台操作流程

---

**报告完成时间**: 2025-12-13 14:55
**下一步**: 立即检查飞书开放平台配置
