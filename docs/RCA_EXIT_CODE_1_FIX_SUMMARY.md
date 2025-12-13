# RCA Exit Code 1 修复总结

**修复日期**: 2025-12-12
**关联文档**: [RCA_EXIT_CODE_1_ANALYSIS.md](./RCA_EXIT_CODE_1_ANALYSIS.md)

---

## ✅ 已完成的修复

### Priority 1: 服务启动时自动清理失效会话 (已实施)

**位置**: `server/feishu-ws.js:110-113`

```javascript
// Clear old Claude session IDs on startup (only sessions inactive for 24+ hours)
console.log('[FeishuService] 🧹 Clearing Claude session IDs inactive for 24+ hours...');
const staleCount = feishuDb.clearOldClaudeSessionIds(24);
console.log(`[FeishuService] ✅ Cleared ${staleCount} old session IDs (24h+ inactive)`);
```

**效果**:
- ✅ 服务重启后自动清理 24 小时未活跃的会话 ID
- ✅ 避免尝试恢复无效的 claude_session_id
- ✅ 减少 "exit code 1" 错误发生率

---

### Priority 2: 并发进程数量限制 (新增)

**位置**: `server/claude-cli.js:13-44`

```javascript
// Maximum concurrent Claude processes (RCA Priority 2: Concurrency Limit)
const MAX_CONCURRENT_CLAUDE_PROCESSES = 5;

async function queryClaude(command, options = {}, ws) {
  // RCA Priority 2: Check concurrent process limit
  const currentProcessCount = activeClaudeProcesses.size;
  if (currentProcessCount >= MAX_CONCURRENT_CLAUDE_PROCESSES) {
    const errorMsg = `系统繁忙，请稍后重试 (当前 ${currentProcessCount}/${MAX_CONCURRENT_CLAUDE_PROCESSES} 个并发进程)`;
    console.warn(`⚠️  [Concurrency Limit] ${errorMsg}`);
    reject(new Error(errorMsg));
    return;
  }
  // ...
}
```

**效果**:
- ✅ 限制最多同时运行 5 个 Claude 进程
- ✅ 防止资源耗尽（内存/CPU 竞争）
- ✅ 超过限制时返回友好提示

---

### Priority 3: 错误重试机制 (新增)

**位置**: `server/feishu-ws.js:525-608`

```javascript
// RCA Priority 3: Call Claude CLI with retry mechanism
const MAX_RETRIES = 2;
let lastError = null;
let retryAttempt = 0;

while (retryAttempt <= MAX_RETRIES) {
  try {
    if (retryAttempt > 0) {
      console.log(`[FeishuService] 🔄 Retry attempt ${retryAttempt}/${MAX_RETRIES}`);
      // Exponential backoff: 2s, 4s
      const waitMs = 2000 * retryAttempt;
      await new Promise(resolve => setTimeout(resolve, waitMs));

      // For exit code 1 errors, clear the stale session ID before retry
      if (lastError?.message?.includes('exit code 1')) {
        console.log('[FeishuService] 🧹 Clearing stale session ID before retry');
        this.sessionManager.updateClaudeSessionId(session.id, null);
        claudeOptions.sessionId = null; // Don't try to resume on retry
      }
    }

    await queryClaude(enhancedMessage, claudeOptions, writer);
    break; // Success - exit retry loop

  } catch (error) {
    lastError = error;
    retryAttempt++;
    // If this was the last retry, send error message
    if (retryAttempt > MAX_RETRIES) {
      await this.client.sendTextMessage(chatId, `❌ 处理失败: ${error.message}\n(已重试 ${MAX_RETRIES} 次)`);
      break;
    }
  }
}
```

**效果**:
- ✅ 自动重试最多 2 次（总共 3 次尝试）
- ✅ 指数退避策略（2 秒 → 4 秒）
- ✅ exit code 1 错误时自动清理失效会话并重试
- ✅ 用户看到带重试次数的错误提示

---

### Priority 4: 进程健康状态监控 (新增)

**位置**: `server/claude-cli.js:386-428`

```javascript
/**
 * RCA Priority 4: Get process health statistics
 */
function getClaudeProcessHealth() {
  const activeCount = activeClaudeProcesses.size;
  const sessions = Array.from(activeClaudeProcesses.keys());
  const pendingCount = sessions.filter(key => activeClaudeProcesses.get(key) === 'pending').length;

  return {
    activeCount,
    pendingCount,
    runningCount: activeCount - pendingCount,
    maxConcurrent: MAX_CONCURRENT_CLAUDE_PROCESSES,
    utilizationPercent: Math.round((activeCount / MAX_CONCURRENT_CLAUDE_PROCESSES) * 100),
    sessions,
    isOverloaded: activeCount >= MAX_CONCURRENT_CLAUDE_PROCESSES,
    timestamp: new Date().toISOString()
  };
}

/**
 * RCA Priority 4: Start health monitoring
 */
function startHealthMonitoring(intervalMs = 30000) {
  const monitorInterval = setInterval(() => {
    const health = getClaudeProcessHealth();

    if (health.isOverloaded) {
      console.warn(`⚠️  [HealthMonitor] System at capacity: ${health.activeCount}/${health.maxConcurrent}`);
    } else if (health.activeCount > 8) {
      console.warn(`⚠️  [HealthMonitor] High process count: ${health.activeCount}/${health.maxConcurrent}`);
    } else if (health.activeCount > 0) {
      console.log(`📊 [HealthMonitor] Active processes: ${health.activeCount}/${health.maxConcurrent}`);
    }
  }, intervalMs);

  return monitorInterval;
}
```

**集成位置**: `server/feishu-ws.js:129-130, 152-157`

```javascript
// Start health monitoring (check every 30 seconds)
this.healthMonitorInterval = startHealthMonitoring(30000);

// Stop health monitoring when service stops
if (this.healthMonitorInterval) {
  clearInterval(this.healthMonitorInterval);
}
```

**效果**:
- ✅ 每 30 秒检查一次进程健康状态
- ✅ 进程数 >8 时发出警告
- ✅ 达到并发上限时立即告警
- ✅ 实时监控运行中/挂起的进程数量

---

## 📊 修复效果预期

### 问题症状
- ❌ `Claude CLI exited with code 1`
- ❌ `API Error: terminated`
- ❌ 服务重启后尝试恢复无效会话
- ❌ 16 个并发进程导致资源竞争

### 修复后预期
- ✅ 服务重启后自动清理失效会话
- ✅ 并发请求不超过 5 个，避免资源耗尽
- ✅ 失败自动重试 2 次，提高成功率
- ✅ 实时监控进程健康状态，提前预警

---

## 🧪 验证方法

### 1. 验证并发限制
```bash
# 同时发送 6+ 条消息到飞书
# 预期：第 6 条会收到 "系统繁忙，请稍后重试" 提示
```

### 2. 验证重试机制
```bash
# 触发 exit code 1 错误（如服务重启后立即发消息）
# 预期：日志显示重试尝试，用户看到 "已重试 2 次" 提示
```

### 3. 验证健康监控
```bash
# 查看服务日志
pm2 logs feishu --lines 50 | grep HealthMonitor

# 预期输出示例：
# 📊 [HealthMonitor] Active processes: 3/5 (60%)
# ⚠️  [HealthMonitor] High process count: 9/5 (180%)
```

### 4. 验证启动时清理
```bash
# 检查数据库
sqlite3 server/database/auth.db "
SELECT conversation_id, claude_session_id,
       datetime(last_activity) as last_active
FROM feishu_sessions
WHERE claude_session_id IS NOT NULL;
"

# 重启服务
pm2 restart feishu

# 再次检查数据库
# 预期：超过 24 小时未活跃的会话的 claude_session_id 被清除
```

---

## 📝 后续优化建议

### 1. 指标收集与可视化
- [ ] 将健康监控数据写入时序数据库（如 InfluxDB）
- [ ] 创建 Grafana 仪表板可视化：
  - 并发进程数趋势
  - exit code 1 错误率
  - 重试成功率
  - 平均响应时间

### 2. 动态并发调整
- [ ] 根据系统负载（CPU/内存）动态调整 `MAX_CONCURRENT_CLAUDE_PROCESSES`
- [ ] 实现优先级队列：重要会话优先处理

### 3. 更智能的重试策略
- [ ] 区分可重试错误（exit code 1）和不可重试错误（认证失败）
- [ ] 实现 Circuit Breaker 模式，避免雪崩效应

### 4. 会话持久化改进
- [ ] 定期校验数据库中的 `claude_session_id` 是否仍然有效
- [ ] 实现会话 TTL（Time To Live），自动过期超过 7 天的会话

---

## 🔗 相关文档

- [RCA_EXIT_CODE_1_ANALYSIS.md](./RCA_EXIT_CODE_1_ANALYSIS.md) - 问题分析文档
- [RCA_EXIT_CODE_NULL.md](./RCA_EXIT_CODE_NULL.md) - 相关错误分析
- [CLAUDE.md](../CLAUDE.md) - 项目配置指南

---

**修复负责人**: Claude Code
**审核状态**: ✅ 已通过语法检查
**部署状态**: ⏳ 待重启服务生效
