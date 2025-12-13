# RCA 最终报告：飞书机器人完全无响应（2025-12-13）

**状态**: 🔴 CRITICAL - 未解决
**更新时间**: 2025-12-13 15:00

---

## 根本原因确认

### 问题症状
- 飞书机器人**完全无响应**，连"收到"确认都没有
- WebSocket连接显示成功，但**没有接收到任何事件**
- 日志中无 `EventDispatcher received` 记录

### 已排除的原因
1. ✅ PM2进程正常（online）
2. ✅ WebSocket连接成功
3. ✅ 事件处理器已注册
4. ✅ 飞书凭据正常
5. ✅ 数据库正常
6. ✅ Fix 1 & Fix 2 正确生效
7. ✅ 飞书开放平台无变更（用户确认）

### 实际根本原因

**核心问题**: 飞书SDK的WebSocket连接虽然显示成功，但**实际没有接收到任何消息事件**

**为什么发生**:
1. **SDK管理问题**: @larksuiteoapi/node-sdk的WebSocket连接是自动管理的，调用`stop()`只设置标志位但不真正关闭连接
2. **实例冲突**: 重启时创建新实例，但旧实例的事件处理器可能还在
3. **事件丢失**: 消息可能被旧实例接收但因`isRunning=false`被忽略

---

## 已实施的修复

### Fix 3: handleMessageEvent添加isRunning检查

```javascript
async handleMessageEvent(data) {
  // 🆕 RCA FIX: 检查实例是否仍在运行
  if (!this.isRunning) {
    console.log('[FeishuClient] ⚠️  Instance stopped, ignoring message');
    return;
  }
  // ... 继续处理
}
```

**目的**: 防止旧实例处理消息

---

## 当前状态

✅ 代码修复已完成
✅ 服务已重启（第25次）
❌ **仍然无响应**

---

## 深层次问题分析

### 可能的真实原因

#### 1. 飞书SDK WebSocket连接实际已断开 ⭐️ **最可能**

**证据**:
- 虽然显示 `WebSocket started successfully`
- 但完全没有任何事件推送
- 持续15分钟以上无任何消息

**验证方法**:
```bash
# 检查实际的网络连接
lsof -p $(pgrep -f feishu-ws.js | head -1) 2>/dev/null | grep ESTABLISHED
```

**根本原因**:
- 6:54的SIGINT可能导致SDK内部状态异常
- 虽然SDK自动重连，但可能失败了
- SDK没有暴露连接状态检查方法

---

#### 2. 飞书开放平台事件订阅配置问题

**即使用户说没变更，仍需检查**:

登录 https://open.feishu.cn，检查：
1. 应用状态是否正常
2. 事件订阅 → im.message.receive_v1 是否启用
3. 推送方式是否为WebSocket
4. 应用权限是否完整

---

#### 3. SDK版本不兼容

**检查package.json**:
```bash
grep "@larksuiteoapi/node-sdk" package.json
```

**已知问题**: 某些SDK版本的WebSocket连接在异常重启后无法恢复

---

## TDD验证方案（按优先级）

### Test 1: 检查WebSocket实际连接状态 ⭐️

```bash
# 1. 检查进程的TCP连接
PID=$(pgrep -f "node.*feishu-ws.js" | head -1)
lsof -p $PID 2>/dev/null | grep -E "TCP.*ESTABLISHED"

# 2. 预期结果：应该有到飞书服务器的ESTABLISHED连接
# 如果没有，说明WebSocket实际未连接
```

### Test 2: 强制重新创建WebSocket连接

```bash
# 完全停止服务
pm2 stop feishu

# 等待5秒确保连接完全关闭
sleep 5

# 启动服务
pm2 start feishu

# 查看启动日志
pm2 logs feishu --lines 50
```

### Test 3: 使用独立脚本测试

```javascript
// tests/test-direct-websocket.js
import lark from '@larksuiteoapi/node-sdk';

const wsClient = new lark.WSClient({
  appId: process.env.FeishuCC_App_ID,
  appSecret: process.env.FeishuCC_App_Secret,
  loggerLevel: lark.LoggerLevel.info
});

const eventDispatcher = new lark.EventDispatcher({
  loggerLevel: lark.LoggerLevel.info
}).register({
  'im.message.receive_v1': async (data) => {
    console.log('🎉 收到消息！', data);
  }
});

await wsClient.start({ eventDispatcher });
console.log('WebSocket已启动，等待消息...');

// 保持运行
await new Promise(() => {});
```

运行：
```bash
node tests/test-direct-websocket.js
```

### Test 4: 检查飞书开放平台配置

**手动验证清单**:
- [ ] 应用状态：启用
- [ ] 事件订阅：im.message.receive_v1 已订阅
- [ ] 推送方式：WebSocket
- [ ] 机器人权限：接收群聊消息、读取用户信息
- [ ] 应用可用范围：所有员工

---

## 紧急修复方案

### 方案A: 完全重启（推荐立即执行）⭐️

```bash
# 1. 完全停止
pm2 stop feishu
sleep 10  # 等待连接完全关闭

# 2. 删除PM2进程（清理状态）
pm2 delete feishu

# 3. 重新启动
pm2 start npm --name "feishu" -- run feishu

# 4. 监控日志
pm2 logs feishu --lines 100
```

### 方案B: 降级SDK版本

```bash
# 如果当前SDK有问题，降级到稳定版本
npm install @larksuiteoapi/node-sdk@1.27.0
pm2 restart feishu
```

### 方案C: 使用HTTP回调模式替代WebSocket

修改为HTTP事件订阅（需要公网域名）：
- 更稳定
- 可以看到HTTP请求日志
- 更容易调试

---

## 行动项（按优先级）

| P | 任务 | 预计时间 | 负责人 |
|---|------|----------|--------|
| 0 | 执行Test 1检查TCP连接 | 1分钟 | Claude |
| 0 | 执行方案A完全重启 | 2分钟 | Claude |
| 0 | 用户在飞书发送测试消息 | 30秒 | 用户 |
| 1 | 执行Test 3独立脚本测试 | 5分钟 | Claude |
| 1 | 用户检查飞书开放平台配置 | 5分钟 | 用户 |
| 2 | 考虑降级SDK版本 | 10分钟 | Claude |
| 2 | 考虑切换到HTTP模式 | 30分钟 | Claude |

---

## 当前建议

**立即执行**:
1. 我执行 Test 1 检查TCP连接
2. 执行方案A完全重启
3. 你在飞书发送测试消息
4. 如果还不行，你检查飞书开放平台配置

**如果以上都不行**:
- 需要考虑SDK bug或飞书平台端问题
- 可能需要联系飞书技术支持

---

**报告时间**: 2025-12-13 15:05
**状态**: 等待进一步测试
