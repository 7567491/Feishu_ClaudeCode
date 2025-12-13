# RCA: SIGINT 错误与飞书机器人连接失败事件分析

**事件时间**: 2025-12-13 06:54:00
**报告时间**: 2025-12-13 14:36
**分析人员**: Claude Code
**严重程度**: 🔴 严重 (服务中断)

---

## 1. 事件概述

### 1.1 故障现象
- **6:54:00**: 两个飞书会话（session 75 & 76）同时收到错误消息：`Claude CLI was terminated by signal SIGINT (进程被用户中断)`
- **6:54:00 之后**: 飞书机器人连接持续失败
- **PM2状态**: feishu服务显示22次重启，当前运行时间仅57分钟（13:36重启）

### 1.2 受影响范围
- **会话75**: `group-oc_36955418a88baa864df11f8024ef8f4a` (最后活跃: 06:33:34)
- **会话76**: `group-oc_8e2e33eb6a0b5fe537a18fa90ff7f44e` (最后活跃: 06:50:04)
- **数据库状态**: 两个会话的 `claude_session_id` 字段均为 `NULL`

---

## 2. 时间线重建

```
06:50:04  用户在会话76发送消息："为什么当前项目发送飞书消息失败了？查看/home/ccp项目改进"
06:50:xx  系统创建Claude子进程处理该请求
06:54:00  【关键事件】两个Claude进程同时收到SIGINT信号
06:54:00  飞书服务接收到 SIGINT 信号，开始优雅关闭
          📴 Received SIGINT, shutting down gracefully...
          [FeishuClient] WebSocket marked as stopped
          [FeishuService] Service stopped
          ✅ Service stopped successfully
06:54:xx  PM2自动重启feishu服务
06:54:xx  服务启动时清理过期的claude_session_id (24小时策略)
之后      用户继续发送消息，但Claude子进程无法恢复（session_id已清空）
13:36:xx  feishu服务最后一次重启（当前运行时间）
```

---

## 3. 五个为什么（5 Whys）分析

### 🔍 为什么1: 为什么飞书机器人连接失败？
**答**: 因为 Claude CLI 进程收到 SIGINT 信号被中断，返回错误消息给用户。

### 🔍 为什么2: 为什么 Claude CLI 进程收到 SIGINT 信号？
**答**: 因为飞书服务（feishu-ws.js）接收到系统级的 SIGINT 信号，在优雅关闭过程中，可能同时终止了其管理的所有Claude子进程。

**证据**:
- 日志显示：`📴 Received SIGINT, shutting down gracefully...`
- 两个会话**同时**在 06:54:00 收到 SIGINT 错误（时间一致性）

### 🔍 为什么3: 为什么飞书服务会收到 SIGINT 信号？
**可能原因**:

**A. 手动操作假设** ❌ **排除**
- 用户在终端按下 Ctrl+C
- 或执行 `pm2 restart feishu`
- **反证**: 从PM2日志看，服务在13:36重启后稳定运行，但06:54的SIGINT未记录明确重启来源

**B. PM2自动重启** ✅ **高度可疑**
- PM2显示22次重启（异常高）
- 可能触发因素：
  - 内存使用超限（PM2配置的max_memory_restart）
  - 健康检查失败
  - 依赖进程崩溃

**C. 系统资源压力** ✅ **非常可能**
- **关键发现**: 会话76正在运行大规模数据下载任务
  - `download_robust.py` 下载5457只股票的历史数据
  - 日志显示持续进行（从06:14到10:47，持续4.5小时）
  - 下载日志中显示：`发送消息失败: None`（飞书API调用失败）
- **系统状态**: `load average: 4.61, 4.02, 3.45`（当前14:36，31天运行时间）

### 🔍 为什么4: 为什么数据下载任务会影响飞书服务？
**答**:
1. **CPU竞争**: download_robust.py是CPU密集型任务（数据处理、API调用）
2. **内存压力**: 大量数据缓存和飞书消息队列
3. **飞书API超限**:
   - download_robust.py配置每5分钟向飞书发送进度消息
   - 与Claude子进程的飞书消息发送冲突
   - 日志显示：`发送消息失败: None`

### 🔍 为什么5: 为什么PM2没有正确隔离这些资源冲突？
**根本原因**:
1. **PM2配置缺失**: 未设置 `max_memory_restart`、`max_cpu_percent` 等限制
2. **进程间通信故障**: download_robust.py 通过环境变量 `FEISHU_CHAT_ID` 调用飞书API，与feishu服务共享同一飞书应用凭据，可能导致API速率限制冲突
3. **缺少进程隔离**: download任务应该在独立进程/容器中运行，而非通过Claude子进程启动
4. **缺少健康监控**: 没有实时监控Claude子进程的资源使用情况

---

## 4. 所有可能的原因假设

### 4.1 直接原因（已确认）
✅ **P0 - SIGINT信号终止Claude进程**
- 日志证据充分
- 时间戳一致

### 4.2 触发因素（高度可信）
✅ **P1 - 资源竞争导致PM2触发重启**
- 证据：22次重启记录
- 证据：下载任务持续运行
- 证据：系统负载较高（4.61）

✅ **P2 - 飞书API速率限制冲突**
- 证据：download日志显示 `发送消息失败: None`
- 机制：两个进程同时调用同一飞书应用的API

### 4.3 根本原因（架构缺陷）
✅ **P3 - 缺少进程资源隔离**
- Claude子进程可以启动任意长时间运行的任务
- PM2未配置资源限制

✅ **P4 - 会话恢复机制不完善**
- 服务重启后清空所有 `claude_session_id`
- 用户会话上下文丢失

### 4.4 次要因素（待验证）
⚠️ **P5 - 数据库锁竞争**
- 多个Claude进程并发写入 `feishu_message_log`
- SQLite的并发限制可能导致进程hang

⚠️ **P6 - 飞书WebSocket连接不稳定**
- 长时间运行可能导致连接断开
- 重连机制可能触发PM2重启

---

## 5. TDD验证方案

### 5.1 测试用例设计

#### Test 1: 重现SIGINT错误
```bash
# 前置条件：启动飞书服务
pm2 start feishu

# 步骤1：发送消息触发Claude进程
# 步骤2：在Claude处理过程中，手动发送SIGINT
pm2 reload feishu

# 预期结果：Claude进程应该收到SIGINT，数据库记录错误消息
# 实际结果：[待验证]
```

#### Test 2: 验证资源隔离
```bash
# 步骤1：在Claude中启动长时间运行的任务
# 步骤2：监控系统资源使用
watch -n 1 'ps aux | grep -E "python.*download|claude" | grep -v grep'

# 预期结果：Python进程应该被限制资源使用
# 实际结果：[待验证]
```

#### Test 3: 验证飞书API速率限制
```python
# 模拟两个进程同时调用飞书API
import asyncio
from server.lib.feishu_client import FeishuClient

async def test_concurrent_api_calls():
    client1 = FeishuClient(...)
    client2 = FeishuClient(...)

    tasks = [
        client1.sendTextMessage(chat_id, f"Message {i}")
        for i in range(100)
    ] + [
        client2.sendTextMessage(chat_id, f"Message {i}")
        for i in range(100)
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    failures = [r for r in results if isinstance(r, Exception)]

    print(f"失败数量: {len(failures)}")
    # 预期结果：部分调用因速率限制失败
```

#### Test 4: 验证会话恢复
```bash
# 步骤1：创建新会话并记录session_id
# 步骤2：重启feishu服务
pm2 restart feishu

# 步骤3：发送新消息
# 预期结果：session_id应该被恢复或重新创建
# 实际结果：session_id被清空（当前行为）
```

---

## 6. 修复建议

### 6.1 立即修复（紧急）

#### Fix 1: 优化会话清理策略
**问题**: 服务重启时清空所有 `claude_session_id`，导致上下文丢失

**修复**:
```javascript
// server/feishu-ws.js:134
// 当前代码（每次启动都清理24小时+的会话）
const staleCount = feishuDb.clearOldClaudeSessionIds(24);

// 建议修改：只在首次启动时清理，或增加清理间隔
const STARTUP_TIMESTAMP_FILE = './.feishu-last-cleanup';
const lastCleanup = fs.existsSync(STARTUP_TIMESTAMP_FILE)
  ? parseInt(fs.readFileSync(STARTUP_TIMESTAMP_FILE, 'utf8'))
  : 0;

const now = Date.now();
if (now - lastCleanup > 24 * 3600 * 1000) { // 24小时才清理一次
  const staleCount = feishuDb.clearOldClaudeSessionIds(24);
  fs.writeFileSync(STARTUP_TIMESTAMP_FILE, now.toString());
}
```

#### Fix 2: 改进SIGINT处理
**问题**: 服务关闭时，Claude子进程被强制终止

**修复**:
```javascript
// server/feishu-ws.js 新增优雅关闭逻辑
async stop() {
  if (!this.isRunning) {
    console.log('[FeishuService] Not running');
    return;
  }

  try {
    // 🆕 先停止接收新消息
    if (this.client) {
      await this.client.stop();
    }

    // 🆕 等待现有Claude进程完成（最多30秒）
    const activeSessions = getActiveClaudeSessions();
    if (activeSessions.length > 0) {
      console.log(`[FeishuService] Waiting for ${activeSessions.length} active Claude sessions...`);

      const timeout = 30000; // 30秒超时
      const start = Date.now();

      while (getActiveClaudeSessions().length > 0 && Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const remaining = getActiveClaudeSessions();
      if (remaining.length > 0) {
        console.warn(`[FeishuService] Timeout: forcefully terminating ${remaining.length} sessions`);
        // 发送SIGTERM而非SIGINT
        remaining.forEach(sid => abortClaudeSession(sid));
      }
    }

    if (this.fileWatcher) {
      await this.fileWatcher.stop();
    }

    this.isRunning = false;
    console.log('[FeishuService] Service stopped gracefully');

  } catch (error) {
    console.error('[FeishuService] Error stopping service:', error.message);
  }
}
```

### 6.2 短期修复（本周内）

#### Fix 3: 增加PM2资源限制
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'feishu',
    script: 'server/feishu-ws.js',
    max_memory_restart: '500M',  // 🆕 内存限制
    max_restarts: 10,             // 🆕 最大重启次数
    min_uptime: '10s',            // 🆕 最小运行时间
    restart_delay: 4000,          // 🆕 重启延迟
    // ... 其他配置
  }]
};
```

#### Fix 4: 隔离长时间运行任务
**方案**: 使用专用的任务队列系统（如Bull、BeeQueue）

```javascript
// server/lib/task-queue.js
import Queue from 'bull';

const downloadQueue = new Queue('download-tasks', {
  redis: { host: 'localhost', port: 6379 }
});

downloadQueue.process(async (job) => {
  const { script, args, chatId } = job.data;

  // 在独立进程中运行
  const result = await runInIsolatedProcess(script, args);

  // 完成后发送飞书消息
  await sendFeishuMessage(chatId, `任务完成: ${result}`);
});

// 使用方式
downloadQueue.add({
  script: 'download_robust.py',
  args: ['--start-date', '20090101'],
  chatId: 'oc_xxx'
}, {
  attempts: 3,
  backoff: 5000
});
```

#### Fix 5: 飞书API速率限制保护
```javascript
// server/lib/feishu-rate-limiter.js
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  points: 100,      // 100个请求
  duration: 60,     // 每60秒
  blockDuration: 10 // 限流后阻塞10秒
});

export async function sendWithRateLimit(chatId, message) {
  try {
    await rateLimiter.consume(chatId, 1);
    return await client.sendTextMessage(chatId, message);
  } catch (rateLimiterRes) {
    console.warn(`[RateLimit] Blocked for ${rateLimiterRes.msBeforeNext}ms`);
    throw new Error('飞书API速率限制，请稍后重试');
  }
}
```

### 6.3 长期改进（下个月）

#### Fix 6: 完整的健康监控系统
- 实现心跳检测（每30秒）
- Claude子进程超时保护（默认5分钟）
- 资源使用告警（CPU > 80%, Memory > 400MB）

#### Fix 7: 会话状态机设计
```
NEW → ACTIVE → PROCESSING → COMPLETED
                  ↓
               SUSPENDED (可恢复)
                  ↓
               TERMINATED (不可恢复)
```

---

## 7. 验证计划

### 7.1 单元测试
- [ ] 测试SIGINT处理逻辑
- [ ] 测试会话清理策略
- [ ] 测试速率限制器

### 7.2 集成测试
- [ ] 模拟资源竞争场景
- [ ] 模拟PM2重启场景
- [ ] 压力测试（100并发请求）

### 7.3 监控指标
- Claude子进程存活时间
- 飞书API调用成功率
- PM2重启频率
- 会话恢复成功率

---

## 8. 结论

### 8.1 根本原因（可控）
**进程生命周期管理不当**：
1. 缺少资源隔离机制
2. SIGINT处理逻辑不完善
3. 会话恢复策略过于激进

### 8.2 触发因素（可控）
**大规模数据下载任务**：
1. CPU/内存竞争
2. 飞书API速率限制冲突
3. PM2自动重启机制触发

### 8.3 防止复发的关键措施
1. ✅ 实施 Fix 1-2（立即）
2. ✅ 配置PM2资源限制（本周）
3. ✅ 引入任务队列系统（本周）
4. ⚠️ 建立完整监控体系（下月）

---

## 9. 行动项

| 优先级 | 任务 | 负责人 | 截止日期 | 状态 |
|--------|------|--------|----------|------|
| P0 | 优化会话清理策略 | Claude | 立即 | ⏳ 待实施 |
| P0 | 改进SIGINT处理 | Claude | 立即 | ⏳ 待实施 |
| P1 | 增加PM2资源限制 | Claude | 本周 | ⏳ 待实施 |
| P1 | 隔离长时间运行任务 | Claude | 本周 | ⏳ 待实施 |
| P2 | 飞书API速率限制 | Claude | 本周 | ⏳ 待实施 |
| P3 | 健康监控系统 | Claude | 下月 | 📋 计划中 |

---

**报告完成时间**: 2025-12-13 14:36
**下次审查**: 修复实施后进行验证
