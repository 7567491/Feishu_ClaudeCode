# 小曼机器人 (Codex) 技术方案

## 执行摘要

**目标**: 在现有飞书集成架构基础上，新增"小曼"机器人调用 OpenAI Codex CLI

**可行性**: ✅ **完全可行** - 可完全复用小六(Claude)的架构模式

**核心优势**:
- 已安装 Codex CLI (`/home/ccp/codex-0.65.0/`)
- 成熟的 Bot-to-Bot 集成模式
- 完整的会话管理和消息流转机制
- 零基础设施改动

---

## 一、现有架构分析

### 1.1 小六机器人调用流程

```
用户 → 飞书消息 → Webhook → feishu-webhook.js
                              ↓
                    queryClaude() ← claude-cli.js
                              ↓
                    spawn('claude', args)
                              ↓
                    FeishuMessageWriter → 实时流式输出
                              ↓
                    飞书群聊 ← 最终响应
```

### 1.2 Bot-to-Bot 集成模式 (AI初老师 → 小六)

```
用户 → AI初老师 → 菜单选择
         ↓
    HTTP POST /api/feishu-proxy/query
         ↓
    server/routes/feishu-proxy.js
         ↓
    queryClaude(message, options) → Claude 处理
         ↓
    FeishuMessageWriter → 群聊响应
```

**关键实现文件**:
- **API 端点**: `server/routes/feishu-proxy.js`
- **AI初老师调用**: `teacher/lib/feishu_client.py:134` (`call_xiaoliu_api`)
- **会话管理**: `server/lib/feishu-session.js`
- **消息写入**: `server/lib/feishu-message-writer.js`

### 1.3 核心技术组件

| 组件 | 文件路径 | 功能 |
|------|---------|------|
| CLI 封装 | `server/claude-cli.js` | spawn Claude 进程、流式输出处理 |
| API 路由 | `server/routes/feishu-proxy.js` | Bot-to-Bot HTTP 接口 |
| 会话管理 | `server/lib/feishu-session.js` | 会话持久化、工作目录管理 |
| 消息写入 | `server/lib/feishu-message-writer.js` | 实时流式消息发送 |
| 飞书客户端 | `server/lib/feishu-client.js` | 飞书 API 封装 |

---

## 二、Codex CLI 环境确认

### 2.1 已安装版本

```bash
✅ Codex CLI 0.65.0 - /home/ccp/codex-0.65.0/
✅ Codex CLI 0.63.0 - /home/ccp/codex-0.63.0/ (备用)
✅ 配置目录 - ~/.codex/
```

### 2.2 认证方式

根据 [OpenAI Codex 官方文档](https://developers.openai.com/codex/cli/reference/)，Codex 支持三种认证:

1. **ChatGPT OAuth** (推荐):
   ```bash
   node /home/ccp/codex-0.65.0/bin/codex.js login
   # 浏览器自动打开 ChatGPT 授权页面
   ```

2. **API Key**:
   ```bash
   export OPENAI_API_KEY=sk-xxxxx
   node /home/ccp/codex-0.65.0/bin/codex.js exec "your prompt"
   ```

3. **设备授权码**:
   ```bash
   node /home/ccp/codex-0.65.0/bin/codex.js login --device
   ```

**推荐配置**: 使用 API Key，环境变量统一管理

### 2.3 命令行参数对比

| 功能 | Claude CLI | Codex CLI |
|------|-----------|-----------|
| 非交互模式 | `-p` (print) | `exec` 子命令 |
| 恢复会话 | `--resume=SESSION_ID` | `resume --last` 或 `resume SESSION_ID` |
| 流式输出 | `--output-format stream-json` | 默认支持流式 |
| 工作目录 | `cwd` 参数 | 同 spawn `cwd` |
| 模型选择 | `--model opus/sonnet/haiku` | `-m gpt-5-codex` |

---

## 三、小曼机器人实现方案

### 3.1 核心文件清单

```
/home/ccp/
├── server/
│   ├── codex-cli.js                    # 新增 - Codex CLI 封装
│   ├── routes/
│   │   └── feishu-codex-proxy.js      # 新增 - 小曼 Bot-to-Bot API
│   ├── feishu-webhook.js              # 修改 - 添加小曼消息处理
│   └── index.js                        # 修改 - 注册 Codex 路由
├── .env                                # 修改 - 添加小曼配置
└── feicc/                              # 自动创建小曼工作目录
```

### 3.2 实现步骤

#### **Step 1: 创建 Codex CLI 封装** (`server/codex-cli.js`)

```javascript
/**
 * Codex CLI Wrapper
 * 参考 claude-cli.js 实现
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let activeCodexProcesses = new Map();

/**
 * 加载 Codex API Key
 */
async function loadCodexApiKey() {
  // 优先从环境变量读取
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  // 尝试从 ~/.codex/config.toml 读取
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    const content = await fs.readFile(configPath, 'utf8');
    // 解析 TOML 获取 api_key
    const match = content.match(/api_key\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 调用 Codex CLI
 * @param {string} prompt - 用户提示词
 * @param {object} options - 配置选项
 * @param {object} writer - FeishuMessageWriter 实例
 */
export async function queryCodex(prompt, options = {}, writer) {
  return new Promise(async (resolve, reject) => {
    const { sessionId, projectPath, cwd } = options;
    let capturedSessionId = sessionId;

    // 构建命令参数
    const args = ['exec', '--no-tty']; // 非交互模式

    // 恢复会话
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // 添加提示词
    args.push(prompt);

    const workingDir = cwd || projectPath || process.cwd();
    const codexPath = 'node';
    const codexScript = '/home/ccp/codex-0.65.0/bin/codex.js';

    // 加载 API Key
    const apiKey = await loadCodexApiKey();
    const spawnEnv = {
      ...process.env,
      OPENAI_API_KEY: apiKey || process.env.OPENAI_API_KEY
    };

    console.log('🚀 Spawning Codex CLI:', codexScript);
    console.log('📁 Working directory:', workingDir);

    // 预注册进程
    const processKey = sessionId || `codex-${Date.now()}`;
    activeCodexProcesses.set(processKey, 'pending');

    const codexProcess = spawn(codexPath, [codexScript, ...args], {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
      detached: true
    });

    activeCodexProcesses.set(processKey, codexProcess);

    let outputBuffer = '';

    // 处理标准输出
    codexProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputBuffer += chunk;

      // 实时发送到飞书
      if (writer) {
        writer.write(chunk);
      }
    });

    // 处理标准错误
    codexProcess.stderr.on('data', (data) => {
      console.error('[Codex stderr]:', data.toString());
    });

    // 进程退出
    codexProcess.on('close', (code) => {
      activeCodexProcesses.delete(processKey);

      if (code === 0) {
        resolve(outputBuffer);
      } else {
        reject(new Error(`Codex exited with code ${code}`));
      }
    });

    codexProcess.on('error', (error) => {
      activeCodexProcesses.delete(processKey);
      reject(error);
    });
  });
}

/**
 * 中止 Codex 会话
 */
export function abortCodexSession(sessionId) {
  const process = activeCodexProcesses.get(sessionId);
  if (process && process.pid) {
    try {
      process.kill('SIGTERM');
      activeCodexProcesses.delete(sessionId);
      return true;
    } catch (error) {
      console.error('[Codex] Failed to abort session:', error);
      return false;
    }
  }
  return false;
}

/**
 * 检查会话是否活跃
 */
export function isCodexSessionActive(sessionId) {
  return activeCodexProcesses.has(sessionId);
}
```

#### **Step 2: 创建 Bot-to-Bot API** (`server/routes/feishu-codex-proxy.js`)

```javascript
/**
 * Feishu Codex Proxy API
 * 允许其他机器人通过HTTP调用小曼的 Codex 能力
 */

import express from 'express';
import { queryCodex } from '../codex-cli.js';
import { FeishuClient } from '../lib/feishu-client.js';
import { FeishuSessionManager } from '../lib/feishu-session.js';
import { FeishuMessageWriter } from '../lib/feishu-message-writer.js';
import { userDb } from '../database/db.js';
import ConfigLoader from '../lib/feishu-shared/config-loader.js';
import DataAccess from '../lib/feishu-shared/data-access.js';

const router = express.Router();

let feishuClient = null;
let sessionManager = null;
let userId = null;

/**
 * 初始化
 */
async function initializeCodexProxy() {
  const user = userDb.getFirstUser();
  if (!user) {
    throw new Error('No user found');
  }

  userId = user.id;

  // 使用小曼机器人的凭据
  const appId = process.env.Feishu_Xiaoman_App_ID;
  const appSecret = process.env.Feishu_Xiaoman_App_Secret;

  if (!appId || !appSecret) {
    throw new Error('Missing Feishu_Xiaoman credentials in .env');
  }

  feishuClient = new FeishuClient({ appId, appSecret });
  sessionManager = new FeishuSessionManager(userId, './feicc');

  console.log('[CodexProxy] Initialized with userId:', userId);
}

/**
 * POST /api/codex-proxy/query
 *
 * Body:
 * {
 *   "message": "Write a Python script to...",
 *   "chatId": "oc_xxx",
 *   "fromBot": "AI初老师",
 *   "apiKey": "xxx"  // 可选
 * }
 */
router.post('/query', async (req, res) => {
  try {
    if (!feishuClient || !sessionManager) {
      await initializeCodexProxy();
    }

    const { message, chatId, fromBot = 'Unknown Bot', apiKey } = req.body;

    if (!message || !chatId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: message, chatId'
      });
    }

    console.log('[CodexProxy] Received query from bot:', fromBot);
    console.log('[CodexProxy] Message:', message);
    console.log('[CodexProxy] Chat ID:', chatId);

    // 创建会话
    const fakeEvent = {
      message: {
        chat_id: chatId,
        chat_type: chatId.startsWith('oc_') ? 'group' : 'p2p',
        message_id: `codex_proxy_${Date.now()}`
      },
      sender: {
        sender_id: { open_id: fromBot },
        sender_type: 'app'
      }
    };

    const session = await sessionManager.getOrCreateSession(fakeEvent);

    if (sessionManager.isSessionBusy(session)) {
      return res.status(429).json({
        success: false,
        error: 'Session is busy, please try again later'
      });
    }

    // 发送确认消息
    await feishuClient.sendTextMessage(chatId, '小曼收到');

    // 记录消息
    DataAccess.logMessage(
      session.id,
      'incoming',
      'text',
      `[From ${fromBot}] ${message}`,
      null
    );

    // 创建消息写入器
    const writer = new FeishuMessageWriter(
      feishuClient,
      chatId,
      session.claude_session_id,  // 复用 claude_session_id 字段
      session.project_path,
      sessionManager,
      session.conversation_id
    );

    // 调用 Codex (异步)
    queryCodex(message, {
      sessionId: session.claude_session_id,
      cwd: session.project_path,
      projectPath: session.project_path
    }, writer)
      .then(async () => {
        if (writer.sessionId && writer.sessionId !== session.claude_session_id) {
          sessionManager.updateClaudeSessionId(session.id, writer.sessionId);
        }

        await writer.complete();
        DataAccess.logMessage(session.id, 'outgoing', 'text', 'Response sent', null);
        console.log('[CodexProxy] Query completed successfully');
      })
      .catch(async (error) => {
        console.error('[CodexProxy] Error processing query:', error.message);
        await feishuClient.sendTextMessage(chatId, `❌ 处理失败: ${error.message}`);
        DataAccess.logMessage(session.id, 'outgoing', 'error', error.message, null);
      });

    // 立即返回
    res.json({
      success: true,
      message: 'Query accepted and processing',
      sessionId: session.id
    });

  } catch (error) {
    console.error('[CodexProxy] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
```

#### **Step 3: 修改主服务** (`server/index.js`)

```javascript
// 添加 Codex Proxy 路由
import codexProxyRouter from './routes/feishu-codex-proxy.js';

// 在现有路由后添加
app.use('/api/codex-proxy', codexProxyRouter);

console.log('✅ Codex Proxy API registered at /api/codex-proxy/query');
```

#### **Step 4: 配置环境变量** (`.env`)

```bash
# =============================================================================
# 小曼机器人 (Codex) 配置
# =============================================================================

# 飞书应用凭据 (需要在飞书开放平台创建新应用)
Feishu_Xiaoman_App_ID=cli_xxxxx
Feishu_Xiaoman_App_Secret=xxxxx

# OpenAI API Key (用于 Codex 认证)
OPENAI_API_KEY=sk-xxxxx

# Codex CLI 路径
CODEX_CLI_PATH=/home/ccp/codex-0.65.0/bin/codex.js

# Codex 模型 (可选，默认 gpt-5-codex)
CODEX_MODEL=gpt-5-codex
```

#### **Step 5: 修改 Webhook 处理器** (`server/feishu-webhook.js`)

```javascript
// 在消息处理函数中添加小曼机器人路由
async function handleMessage(event) {
  // ... 现有代码 ...

  // 检测是否需要路由到小曼
  const text = event.message?.content?.text || '';
  if (text.toLowerCase().startsWith('codex ') || text.toLowerCase().startsWith('小曼 ')) {
    // 提取实际消息
    const actualMessage = text.replace(/^(codex|小曼)\s+/i, '');

    // 调用 Codex Proxy
    const response = await fetch('http://localhost:33300/api/codex-proxy/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: actualMessage,
        chatId: event.message.chat_id,
        fromBot: 'DirectUser'
      })
    });

    return; // 不再继续处理
  }

  // ... 现有 Claude 处理逻辑 ...
}
```

---

## 四、部署与测试

### 4.1 部署步骤

```bash
# 1. 创建小曼机器人文件
cp server/claude-cli.js server/codex-cli.js
cp server/routes/feishu-proxy.js server/routes/feishu-codex-proxy.js

# 2. 修改 server/index.js 注册路由

# 3. 配置环境变量
# 编辑 .env 添加 Feishu_Xiaoman_App_ID 等

# 4. 在飞书开放平台创建"小曼"应用
# 获取 App ID 和 App Secret

# 5. 配置 Codex CLI 认证
node /home/ccp/codex-0.65.0/bin/codex.js login
# 或设置 OPENAI_API_KEY

# 6. 重启服务 (提示用户手动执行)
# pm2 restart claude-code-ui
```

### 4.2 测试用例

```bash
# 测试 1: 直接调用 Codex CLI
node /home/ccp/codex-0.65.0/bin/codex.js exec "Write a hello world in Python"

# 测试 2: API 接口测试
curl -X POST http://localhost:33300/api/codex-proxy/query \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a Python function to calculate fibonacci",
    "chatId": "oc_test",
    "fromBot": "TestBot"
  }'

# 测试 3: 飞书群聊测试
# 在群聊中发送: codex Write a simple web server
```

### 4.3 监控与日志

```bash
# 查看服务日志
pm2 logs claude-code-ui

# 查看 Codex 进程
ps aux | grep codex

# 查看会话状态
sqlite3 server/database/auth.db "SELECT * FROM feishu_sessions WHERE conversation_id LIKE '%xiaoman%';"
```

---

## 五、风险评估与对策

### 5.1 技术风险

| 风险 | 可能性 | 影响 | 对策 |
|------|-------|------|------|
| Codex API 限流 | 中 | 高 | 实现请求队列、错误重试 |
| 会话恢复失败 | 低 | 中 | 参考 Claude 的会话清理机制 |
| 输出格式不兼容 | 中 | 低 | 增强输出解析逻辑 |
| 认证过期 | 低 | 高 | 定期刷新 token，环境变量备份 |

### 5.2 成本风险

- **OpenAI API 费用**: 根据 [Codex 定价](https://openai.com/codex/)，建议设置使用额度上限
- **服务器资源**: Codex 进程占用内存约 200-500MB，需监控

### 5.3 安全风险

- **API Key 泄露**: 建议使用 `.env` 存储，不提交到 Git
- **跨租户访问**: 飞书群聊限制访问权限
- **恶意代码生成**: 考虑添加代码审查步骤

---

## 六、后续优化方向

### 6.1 功能增强

1. **智能路由**:
   - 根据问题类型自动选择 Claude 或 Codex
   - 编程类问题 → Codex
   - 通用对话 → Claude

2. **协作模式**:
   - Claude 负责架构设计
   - Codex 负责代码实现
   - 自动协调两个模型的输出

3. **代码审查**:
   - Claude Review Codex 生成的代码
   - 提供安全性和最佳实践建议

### 6.2 性能优化

1. **缓存机制**:
   - 相似问题复用之前的回答
   - 减少 API 调用成本

2. **并发控制**:
   - 限制单个群聊的并发请求
   - 全局请求队列管理

3. **流式优化**:
   - 更快的首字节响应时间
   - 分段发送长消息

---

## 七、对比分析

### 7.1 Claude vs Codex

| 维度 | Claude (小六) | Codex (小曼) |
|------|--------------|--------------|
| 适用场景 | 通用对话、分析、写作 | 代码生成、调试、重构 |
| 响应速度 | 快 | 中等 |
| 代码质量 | 中 | 高 |
| 上下文理解 | 强 | 中 |
| API 成本 | 中 | 高 |
| 会话持久化 | ✅ 支持 | ⚠️ 需验证 |

### 7.2 推荐使用场景

- **使用小六 (Claude)**:
  - 需求分析、架构设计
  - 文档编写、代码解释
  - 多轮对话、上下文关联

- **使用小曼 (Codex)**:
  - 快速生成样板代码
  - 算法实现、代码补全
  - Bug 修复、单元测试

---

## 八、总结

### 8.1 核心结论

✅ **技术可行性**: 100% 可行，可完全复用小六的架构

✅ **实现难度**: 低，主要是复制和配置工作

✅ **投入产出比**: 高，新增功能价值显著

### 8.2 关键优势

1. **零基础设施改动**: 复用现有服务、数据库、会话管理
2. **一致的用户体验**: 与小六相同的交互模式
3. **灵活的扩展性**: 可轻松添加更多 AI 模型机器人

### 8.3 下一步行动

1. ✅ 在飞书开放平台创建"小曼"应用
2. ✅ 配置 Codex CLI 认证 (API Key)
3. ✅ 创建 `server/codex-cli.js` 和 `server/routes/feishu-codex-proxy.js`
4. ✅ 修改 `server/index.js` 注册路由
5. ✅ 更新 `.env` 添加小曼配置
6. ⚠️  重启服务 (提示用户手动执行，禁止 PM2 命令)
7. ✅ 测试并迭代优化

---

## 参考资料

- [OpenAI Codex CLI 官方文档](https://developers.openai.com/codex/cli)
- [Codex GitHub 仓库](https://github.com/openai/codex)
- [OpenAI API 认证指南](https://developers.openai.com/codex/guides/api-key/)
- [GPT-5.2-Codex 发布公告](https://openai.com/index/introducing-gpt-5-2-codex/)
- 本项目 `/home/ccp/CLAUDE.md` - 架构文档
- 本项目 `server/claude-cli.js` - Claude CLI 封装参考实现

---

**生成时间**: 2025-12-26
**作者**: Claude Opus 4.5
**版本**: v1.0
