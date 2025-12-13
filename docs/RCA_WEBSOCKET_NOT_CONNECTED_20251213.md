# RCA 更新：WebSocket未建立实际连接（2025-12-13 17:00）

**状态**: 🔴 CRITICAL - 确认根本原因
**更新时间**: 2025-12-13 17:00

---

## 问题重新确认

### 症状
- ✅ 飞书服务运行正常（PM2 online）
- ✅ 日志显示"WebSocket started successfully"
- ❌ **但完全没有接收到任何事件**
- ❌ **进程没有任何TCP ESTABLISHED连接**

### 关键证据

#### 证据1: 用户报告
> "会飞的CC"群刚发了2条消息都没有响应

#### 证据2: 日志分析
- 服务启动日志正常
- 但**没有任何** `EventDispatcher received` 日志
- 日志中配置：`No-mention-required chats: 3`

#### 证据3: 网络连接检查
```bash
# 进程ID: 3236093
netstat -tnp | grep 3236093
# 结果：无任何TCP连接
```

#### 证据4: 数据库记录
- 会话18（oc_b65746dca5fa801872449be1e3f87250）：✅ 正常响应（16:50最后活跃）
- 会话77（oc_5d40b0cd98849b2c87ae950ec65e1de7）：❌ 创建但无消息
- 其他会话：❌ 06:54后无响应

---

## 根本原因分析

### 真正的问题：WebSocket连接状态异常

**为什么会出现这种情况**:
1. 飞书SDK的WebSocket客户端内部状态异常
2. `wsClient.start()` 返回成功，但实际连接未建立
3. 没有底层的连接健康检查机制

**为什么会话18还能响应**:
- 会话18最后活跃在16:50
- 而当前服务最后一次启动时间应该在16:50之后
- 说明会话18的响应可能是**服务重启前**的记录

让我验证：
```sql
SELECT datetime(created_at, 'localtime') FROM feishu_message_log
WHERE session_id = 18
ORDER BY created_at DESC LIMIT 3;
```
结果：16:50、15:50、15:44

**PM2日志显示的最后启动时间**：无具体时间戳，但启动后显示 "⏭️ Skipping cleanup (last cleaned 0.3h ago)"

**结论**：会话18的最后响应（16:50）可能是服务重启前的！

---

## SDK问题诊断

### 飞书SDK版本检查
```bash
grep "@larksuiteoapi/node-sdk" package.json
```

### 可能的SDK问题
1. **WebSocket连接静默失败**
   - SDK没有抛出异常
   - 没有重连机制
   - 没有心跳检测

2. **事件订阅未生效**
   - 注册了事件处理器
   - 但飞书平台端未推送

3. **网络层问题**
   - 防火墙、代理、DNS
   - 飞书服务器端阻止连接

---

## 立即修复方案

### 方案1: 完全重启（验证连接）⭐️ 立即执行

```bash
# 1. 完全停止
pm2 stop feishu
pm2 delete feishu

# 2. 清理所有node进程
pkill -f "feishu-ws.js"

# 3. 等待10秒
sleep 10

# 4. 重新启动
pm2 start npm --name "feishu" -- run feishu

# 5. 立即检查TCP连接
sleep 5
PID=$(pgrep -f "feishu-ws.js" | head -1)
echo "进程ID: $PID"
netstat -tnp 2>/dev/null | grep $PID

# 6. 如果有连接，应该看到到飞书服务器的ESTABLISHED连接
```

**预期结果**：
- 如果重启后有TCP连接 → SDK临时故障，已修复
- 如果重启后仍无TCP连接 → SDK配置或网络问题

---

### 方案2: 添加连接验证（代码修复）

修改 `server/lib/feishu-client.js`：

```javascript
async start(messageHandler) {
  // ... 现有启动代码

  await this.wsClient.start({ eventDispatcher });
  this.isRunning = true;
  console.log('[FeishuClient] WebSocket started successfully');

  // 🆕 验证连接是否真正建立
  await this.verifyConnection();
}

async verifyConnection() {
  console.log('[FeishuClient] Verifying WebSocket connection...');

  // 等待3秒让连接建立
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 检查是否能获取token（验证API连通性）
  try {
    const result = await this.client.request({
      method: 'POST',
      url: '/open-apis/auth/v3/app_access_token/internal',
      data: {
        app_id: this.appId,
        app_secret: this.appSecret
      }
    });

    if (result.code === 0) {
      console.log('[FeishuClient] ✅ API connection verified');
    } else {
      console.error('[FeishuClient] ❌ API connection failed:', result);
      throw new Error('API connection verification failed');
    }
  } catch (error) {
    console.error('[FeishuClient] ❌ Connection verification failed:', error.message);
    throw error;
  }

  // 启动心跳检测
  this.startHeartbeat();
}

startHeartbeat() {
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
  }

  this.heartbeatTimer = setInterval(async () => {
    if (!this.isRunning) return;

    try {
      await this.client.request({
        method: 'POST',
        url: '/open-apis/auth/v3/app_access_token/internal',
        data: {
          app_id: this.appId,
          app_secret: this.appSecret
        }
      });
      console.log('[FeishuClient] ❤️  Heartbeat OK');
    } catch (error) {
      console.error('[FeishuClient] 💔 Heartbeat failed:', error.message);
      // 触发重连
      await this.reconnect();
    }
  }, 60000); // 每分钟心跳
}
```

---

## 行动项

| P | 任务 | 命令 | 预计时间 |
|---|------|------|----------|
| P0 | 执行方案1完全重启 | 见上文bash命令 | 2分钟 |
| P0 | 验证TCP连接状态 | `netstat -tnp \| grep <PID>` | 30秒 |
| P0 | 用户发送测试消息 | 飞书中发送"测试" | 30秒 |
| P1 | 如仍无效，实施方案2 | 修改代码添加验证 | 30分钟 |

---

**报告时间**: 2025-12-13 17:05
**下一步**: 立即执行方案1完全重启
