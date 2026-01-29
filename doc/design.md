# 小曼机器人 (Codex) 技术设计方案

## 📋 执行摘要

**项目名称**: 小曼机器人 (基于 OpenAI Codex CLI)
**目标**: 在现有飞书集成架构基础上，新增"小曼"机器人调用 gaccode 改造的 Codex CLI
**可行性**: ✅ **完全可用** - 已验证 Codex CLI 正常运行，可复用小六架构
**开发周期**: 1-4 小时（根据方案选择）
**认证状态**: ✅ 已配置 gaccode token，无需额外登录

**核心优势**:
- ✅ Codex CLI v0.65.0 已安装并可用
- ✅ 成熟的 Bot-to-Bot 集成模式
- ✅ 完整的会话管理和消息流转机制
- ✅ 零基础设施改动
- ✅ 小曼凭证已配置（`Feishu_Xiaoman_App_ID`）

## 更新 (2026-01-02)

- 多机器人 webhook 分流已实现：按 verification token 优先，缺失 app_id 时回退小曼，再回退小六，确保三机器人（小六/小曼/AI初老师）互不冲突。
- 小曼私聊收发已验证，Webhook 按 app_id/label 直接路由 Codex Proxy，默认走 Codex CLI。
- PM2 环境已注入三套 Feishu 凭证/Token，分流日志可见 token map。
- FeishuMessageWriter 增加 write(chunk) 兼容 Codex 纯文本流，Codex CLI 输出不再抛错；并发锁放宽为提示排队。
- Feishu webhook 兼容根节点 header/token，避免小曼被错误识别为主 bot。

---

## 一、Codex CLI 可用性验证报告

### 1.1 核心功能验证

| 功能 | 状态 | 测试结果 |
|------|------|---------|
| **基本运行** | ✅ 通过 | 成功响应代码生成请求 |
| **模型调用** | ✅ 通过 | gpt-5.1-codex-max 正常工作 |
| **流式输出** | ✅ 通过 | 实时返回思考过程和代码 |
| **会话创建** | ✅ 通过 | 自动生成 session_id |
| **非交互模式** | ✅ 通过 | `exec` 命令完全可用 |
| **工作目录** | ✅ 支持 | cwd 参数可用 |
| **认证机制** | ✅ 通过 | 复用 gaccode token |

### 1.2 测试示例

**命令**:
```bash
export CODEX_API_KEY="$(cat ~/.claudecode/config | jq -r '.token')"
node /home/ccp/codex-0.65.0/bin/codex.js exec "写一个Python函数计算1+1"
```

**输出**:
```
OpenAI Codex v0.65.0 (research preview)
--------
workdir: /home/ccp
model: gpt-5.1-codex-max
provider: codex
session id: 019b7a08-db01-7892-8aab-7cc2d28c5115
--------
user
写一个Python函数计算1+1

thinking
**Providing read-only Python function**

codex
A tiny Python function:

```python
def add_one_and_one() -> int:
    return 1 + 1
```

tokens used: 1,118
```

**验证结论**: ✅ Codex CLI 完全可用，支持流式输出和代码生成

### 1.3 认证配置详解

**gaccode 认证机制**:
- **API 端点**: `https://gaccode.com/codex/v1`
- **模型**: `gpt-5.1-codex-max`
- **Token 来源**: `~/.claudecode/config` 中的 JWT token
- **有效期**: 2026-01-01 到期（还有30天）
- **环境变量**: `CODEX_API_KEY`

**配置文件** (`~/.codex/config.toml`):
```toml
model_provider = "codex"
model = "gpt-5.1-codex-max"
model_reasoning_effort = "medium"

[model_providers.codex]
name = "codex"
base_url = "https://gaccode.com/codex/v1"
wire_api = "responses"
env_key = "CODEX_API_KEY"
```

**重要发现**:
- ✅ 无需单独登录 OpenAI
- ✅ 直接复用 gaccode 统一认证
- ✅ Token 自动从 `~/.claudecode/config` 读取

---

## 二、架构设计

### 2.1 现有架构回顾

#### 小六机器人调用流程
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

#### Bot-to-Bot 集成模式 (AI初老师 → 小六)
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

### 2.2 小曼机器人架构（设计）

```
用户 → 飞书消息 → Webhook → feishu-webhook.js
                              ↓
                    (检测关键词: "codex" 或 "小曼")
                              ↓
                    queryCodex() ← codex-cli.js
                              ↓
                    spawn('node', ['codex-0.65.0/bin/codex.js', 'exec', ...])
                              ↓
                    env: { CODEX_API_KEY: gaccode_token }
                              ↓
                    FeishuMessageWriter → 实时流式输出
                              ↓
                    飞书群聊 ← 最终响应
```

### 2.3 核心文件清单

```
/home/ccp/
├── server/
│   ├── codex-cli.js                    # 新增 - Codex CLI 封装
│   ├── routes/
│   │   └── feishu-codex-proxy.js      # 新增 - 小曼 Bot-to-Bot API
│   ├── feishu-webhook.js              # 修改 - 添加小曼消息处理
│   └── index.js                        # 修改 - 注册 Codex 路由
├── .env                                # 已配置 - 小曼凭据
└── feicc/                              # 自动创建小曼工作目录
```

### 2.4 与 Claude CLI 的关键差异

| 对比项 | Claude CLI | Codex CLI | 影响 |
|--------|-----------|-----------|------|
| **认证方式** | `~/.claudecode/config` | 环境变量 `CODEX_API_KEY` | 需在 spawn 时设置 env |
| **非交互模式** | `-p` 参数 | `exec` 子命令 | 修改 args 构建方式 |
| **会话恢复** | `--resume=SESSION_ID` | `resume SESSION_ID` | ⚠️ exec 模式不支持 resume |
| **流式输出** | `--output-format stream-json` | 默认流式 | 简化处理逻辑 |
| **输出格式** | JSON 结构化 | 纯文本 | 需要文本解析 |
| **工作目录** | `cwd` 参数 | 同 spawn `cwd` | 兼容 |
| **沙箱权限** | 无限制 | 默认 read-only | 需修改配置 |

---

## 三、实现方案对比

### 方案 A：简化版（推荐用于快速验证）

**特点**:
- 每次创建新会话，无上下文持久化
- 使用 `exec` 命令非交互模式
- 数据库只存储消息历史，不存储 session_id

**优点**:
- ✅ 实现简单，2小时完成
- ✅ 代码复用度高（80% 复用 claude-cli.js）
- ✅ 稳定性高，无状态管理复杂性

**缺点**:
- ❌ 用户每次需要重复上下文
- ❌ 无法实现多轮对话

**适用场景**:
- 快速原型验证
- 代码片段生成
- 一次性问题解答

**实现难度**: ⭐⭐☆☆☆

---

### 方案 B：完整版（推荐用于生产环境）

**特点**:
- 使用交互模式 + stdin/stdout 流式通信
- 进程常驻，支持会话持久化
- 数据库存储 codex_session_id 和进程 PID

**优点**:
- ✅ 完整支持会话恢复
- ✅ 多轮对话上下文完整
- ✅ 用户体验与小六一致

**缺点**:
- ❌ 实现复杂度提高 50%
- ❌ 需要维护进程池
- ❌ 可能存在进程僵死风险

**适用场景**:
- 生产环境长期使用
- 需要复杂多轮对话
- 代码重构等需要上下文的任务

**实现难度**: ⭐⭐⭐⭐☆

**技术挑战**:
1. 交互模式需要处理 stdin/stdout 双向通信
2. 进程生命周期管理复杂
3. 信号处理和优雅退出

---

### 方案 C：混合版（推荐，平衡实现成本和体验）⭐

**特点**:
- exec 模式 + 数据库存储对话历史
- 手动上下文注入（最近 3-5 轮对话）
- 每次请求前自动拼接历史上下文

**实现原理**:
```javascript
// 1. 从数据库读取最近 3 轮对话
const recentMessages = DataAccess.getRecentMessages(sessionId, 3);

// 2. 构建上下文提示词
const contextPrompt = `
之前的对话：
${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

当前问题：
${userMessage}
`;

// 3. 调用 Codex（每次都是新会话，但注入了历史）
await queryCodex(contextPrompt, options, writer);
```

**优点**:
- ✅ 实现简单（在方案 A 基础上加 50 行代码）
- ✅ 有限的上下文能力（足够应对大部分场景）
- ✅ 无进程管理复杂性
- ✅ 可控的上下文长度（避免 token 超限）

**缺点**:
- ⚠️ 上下文有限（只保留最近 N 轮）
- ⚠️ 长时间对话可能丢失早期信息

**适用场景**:
- 生产环境推荐方案
- 平衡开发成本和用户体验
- 大部分代码生成任务

**实现难度**: ⭐⭐⭐☆☆

---

### 方案选择建议

| 阶段 | 推荐方案 | 理由 |
|------|---------|------|
| **MVP 验证** | 方案 A | 快速上线，验证需求 |
| **Beta 测试** | 方案 C | 平衡体验和稳定性 |
| **正式上线** | 方案 C | 成本可控，体验良好 |
| **长期规划** | 方案 B | 终极方案，待稳定后迁移 |

**最终推荐**: **方案 C（混合版）**

---

## 四、核心代码实现（方案 C）

### 4.1 创建 `server/codex-cli.js`

```javascript
/**
 * Codex CLI Wrapper
 * 参考 claude-cli.js 实现，适配 gaccode Codex CLI
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let activeCodexProcesses = new Map();

/**
 * 加载 gaccode Token
 * @returns {Promise<string|null>}
 */
async function loadGaccodeToken() {
  try {
    const configPath = path.join(os.homedir(), '.claudecode', 'config');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    return config.token || null;
  } catch (error) {
    console.error('[Codex] Failed to load gaccode token:', error.message);
    return null;
  }
}

/**
 * 调用 Codex CLI
 * @param {string} prompt - 用户提示词（已包含历史上下文）
 * @param {object} options - 配置选项
 * @param {object} writer - FeishuMessageWriter 实例
 */
export async function queryCodex(prompt, options = {}, writer) {
  return new Promise(async (resolve, reject) => {
    const { projectPath, cwd } = options;

    // 构建命令参数（exec 非交互模式）
    const args = ['exec', prompt];

    const workingDir = cwd || projectPath || process.cwd();
    const codexPath = 'node';
    const codexScript = '/home/ccp/codex-0.65.0/bin/codex.js';

    // 加载 gaccode Token
    const token = await loadGaccodeToken();
    if (!token) {
      return reject(new Error('Failed to load CODEX_API_KEY from gaccode config'));
    }

    const spawnEnv = {
      ...process.env,
      CODEX_API_KEY: token  // 关键！设置环境变量
    };

    console.log('[Codex] 🚀 Spawning Codex CLI:', codexScript);
    console.log('[Codex] 📁 Working directory:', workingDir);
    console.log('[Codex] 🔑 Token loaded:', token.substring(0, 20) + '...');

    // 预注册进程
    const processKey = `codex-${Date.now()}`;
    activeCodexProcesses.set(processKey, 'pending');

    const codexProcess = spawn(codexPath, [codexScript, ...args], {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
      detached: true  // 防止 PM2 信号传播
    });

    activeCodexProcesses.set(processKey, codexProcess);

    let outputBuffer = '';
    let isFirstChunk = true;

    // 处理标准输出
    codexProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputBuffer += chunk;

      // 过滤头部信息（首次输出包含版本、配置等）
      if (isFirstChunk) {
        isFirstChunk = false;
        // 跳过 "OpenAI Codex v0.65.0..." 等头部信息
        const contentStart = chunk.indexOf('\nuser\n');
        if (contentStart !== -1) {
          const actualContent = chunk.substring(contentStart + 6); // 跳过 "\nuser\n"
          if (writer && actualContent.trim()) {
            writer.write(actualContent);
          }
          return;
        }
      }

      // 实时发送到飞书
      if (writer) {
        writer.write(chunk);
      }
    });

    // 处理标准错误
    codexProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.error('[Codex stderr]:', errorMsg);

      // 将错误也发送到飞书
      if (writer && errorMsg.includes('ERROR:')) {
        writer.write(`\n❌ ${errorMsg}\n`);
      }
    });

    // 进程退出
    codexProcess.on('close', (code, signal) => {
      activeCodexProcesses.delete(processKey);

      if (signal) {
        const errorMsg = `⚠️ Codex 进程被信号终止: ${signal}`;
        console.error('[Codex]', errorMsg);
        reject(new Error(errorMsg));
      } else if (code === 0) {
        console.log('[Codex] ✅ Process completed successfully');
        resolve(outputBuffer);
      } else {
        const errorMsg = `Codex exited with code ${code}`;
        console.error('[Codex]', errorMsg);
        reject(new Error(errorMsg));
      }
    });

    codexProcess.on('error', (error) => {
      activeCodexProcesses.delete(processKey);
      console.error('[Codex] Process error:', error);
      reject(error);
    });
  });
}

/**
 * 中止 Codex 会话（暂不支持，因为每次都是新进程）
 */
export function abortCodexSession(processKey) {
  const process = activeCodexProcesses.get(processKey);
  if (process && process.pid) {
    try {
      // 杀死整个进程组
      process.kill('SIGTERM');
      activeCodexProcesses.delete(processKey);
      console.log('[Codex] Process terminated:', processKey);
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
export function isCodexSessionActive(processKey) {
  return activeCodexProcesses.has(processKey);
}
```

### 4.2 创建 `server/routes/feishu-codex-proxy.js`

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

  console.log('[CodexProxy] ✅ Initialized with userId:', userId);
  console.log('[CodexProxy] 🤖 App ID:', appId);
}

/**
 * 构建上下文提示词（方案 C 核心逻辑）
 */
function buildContextPrompt(recentMessages, currentMessage) {
  if (!recentMessages || recentMessages.length === 0) {
    return currentMessage;
  }

  // 过滤掉系统消息，只保留用户和助手的对话
  const validMessages = recentMessages
    .filter(m => m.direction === 'incoming' || m.direction === 'outgoing')
    .slice(-6); // 最近 3 轮对话（6条消息）

  if (validMessages.length === 0) {
    return currentMessage;
  }

  const contextLines = validMessages.map(m => {
    const role = m.direction === 'incoming' ? '用户' : 'Codex';
    return `${role}: ${m.content}`;
  });

  return `之前的对话：
${contextLines.join('\n')}

当前问题：
${currentMessage}`;
}

/**
 * POST /api/codex-proxy/query
 *
 * Body:
 * {
 *   "message": "Write a Python script to...",
 *   "chatId": "oc_xxx",
 *   "fromBot": "AI初老师"
 * }
 */
router.post('/query', async (req, res) => {
  try {
    if (!feishuClient || !sessionManager) {
      await initializeCodexProxy();
    }

    const { message, chatId, fromBot = 'Unknown Bot' } = req.body;

    if (!message || !chatId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: message, chatId'
      });
    }

    console.log('[CodexProxy] 📩 Received query from bot:', fromBot);
    console.log('[CodexProxy] 💬 Message:', message);
    console.log('[CodexProxy] 🆔 Chat ID:', chatId);

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
    await feishuClient.sendTextMessage(chatId, '小曼收到，正在思考...');

    // 记录消息
    DataAccess.logMessage(
      session.id,
      'incoming',
      'text',
      `[From ${fromBot}] ${message}`,
      null
    );

    // 【方案 C 核心】读取历史消息，构建上下文
    const recentMessages = DataAccess.getRecentMessages(session.id, 6);
    const promptWithContext = buildContextPrompt(recentMessages, message);

    console.log('[CodexProxy] 📚 Context injected, total messages:', recentMessages.length);

    // 创建消息写入器
    const writer = new FeishuMessageWriter(
      feishuClient,
      chatId,
      null,  // codex 不存储 session_id（每次新会话）
      session.project_path,
      sessionManager,
      session.conversation_id
    );

    // 调用 Codex (异步)
    queryCodex(promptWithContext, {
      cwd: session.project_path,
      projectPath: session.project_path
    }, writer)
      .then(async () => {
        await writer.complete();
        DataAccess.logMessage(session.id, 'outgoing', 'text', 'Response sent', null);
        console.log('[CodexProxy] ✅ Query completed successfully');
      })
      .catch(async (error) => {
        console.error('[CodexProxy] ❌ Error processing query:', error.message);
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
    console.error('[CodexProxy] ❌ Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
```

### 4.3 修改 `server/index.js`

```javascript
// 在文件顶部添加导入
import codexProxyRouter from './routes/feishu-codex-proxy.js';

// 在现有路由注册后添加（约第 50-60 行）
app.use('/api/codex-proxy', codexProxyRouter);

console.log('✅ Codex Proxy API registered at /api/codex-proxy/query');
```

### 4.4 修改 `server/feishu-webhook.js`（可选）

如果需要直接在飞书中使用 "codex" 或 "小曼" 关键词触发：

```javascript
// 在 handleMessage 函数中添加（约第 200 行）
async function handleMessage(event) {
  const text = event.message?.content?.text || '';

  // 检测小曼关键词
  if (text.toLowerCase().startsWith('codex ') || text.toLowerCase().startsWith('小曼 ')) {
    const actualMessage = text.replace(/^(codex|小曼)\s+/i, '');

    // 调用 Codex Proxy
    try {
      const response = await fetch('http://localhost:33300/api/codex-proxy/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: actualMessage,
          chatId: event.message.chat_id,
          fromBot: 'DirectUser'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log('[Webhook] ✅ Codex query dispatched');
    } catch (error) {
      console.error('[Webhook] ❌ Failed to dispatch to Codex:', error.message);
      await feishuClient.sendTextMessage(event.message.chat_id, '❌ 小曼调用失败，请稍后重试');
    }

    return; // 不再继续处理
  }

  // ... 现有 Claude 处理逻辑 ...
}
```

---

## 五、部署步骤

### 5.1 文件创建清单

```bash
# 1. 创建 Codex CLI 封装
# 文件位置: server/codex-cli.js
# 内容: 见 4.1 节

# 2. 创建 Codex Proxy API
# 文件位置: server/routes/feishu-codex-proxy.js
# 内容: 见 4.2 节

# 3. 修改主服务
# 文件位置: server/index.js
# 内容: 见 4.3 节

# 4. （可选）修改 Webhook 处理器
# 文件位置: server/feishu-webhook.js
# 内容: 见 4.4 节
```

### 5.2 环境变量确认

已在 `.env` 中配置：
```bash
# 飞书CC机器人-小曼
Feishu_Xiaoman_App_ID=cli_a9dc3f8e93789cda
Feishu_Xiaoman_App_Secret=6ihOEzkS4tPhRgO4dVfTSbcT5SBZAOBK
Feishu_Xiaoman_Verification_Token=GFsviFgBbx7wqwy5FGIZedXRWo2rEMGP
Feishu_Xiaoman_Encrypt_Key=NA
```

### 5.3 飞书应用配置

在飞书开放平台确认：
- ✅ 应用名称：小曼
- ✅ App ID：`cli_a9dc3f8e93789cda`
- ✅ Webhook 地址：`https://ccode.linapp.fun/webhook`
- ✅ 订阅事件：`im.message.receive_v1`
- ✅ 权限范围：
  - `im:message`
  - `im:message.group_at_msg`
  - `im:chat`

### 5.4 测试步骤

```bash
# 1. 测试 Codex CLI 基础功能
export CODEX_API_KEY="$(cat ~/.claudecode/config | jq -r '.token')"
node /home/ccp/codex-0.65.0/bin/codex.js exec "写一个hello world"

# 2. 测试 API 接口
curl -X POST http://localhost:33300/api/codex-proxy/query \
  -H "Content-Type: application/json" \
  -d '{
    "message": "用 Python 写一个斐波那契函数",
    "chatId": "ou_xxx",
    "fromBot": "TestBot"
  }'

# 3. 在飞书群聊测试
# 发送消息: codex 写一个简单的 web server

# 4. 查看日志
pm2 logs claude-code-ui --lines 50
```

---

## 六、监控与运维

### 6.1 健康检查

```bash
# 查看服务状态
pm2 status

# 查看 Codex 进程
ps aux | grep codex

# 查看会话状态
sqlite3 server/database/auth.db "
SELECT conversation_id, project_path, last_activity
FROM feishu_sessions
WHERE conversation_id LIKE '%xiaoman%'
ORDER BY last_activity DESC
LIMIT 10;
"

# 查看消息统计
sqlite3 server/database/auth.db "
SELECT
  COUNT(CASE WHEN direction='incoming' THEN 1 END) as requests,
  COUNT(CASE WHEN direction='outgoing' THEN 1 END) as responses
FROM feishu_message_log
WHERE session_id IN (
  SELECT id FROM feishu_sessions WHERE conversation_id LIKE '%xiaoman%'
);
"
```

### 6.2 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 401 Unauthorized | Token 过期 | 刷新 gaccode token |
| Missing CODEX_API_KEY | 环境变量未设置 | 检查 loadGaccodeToken() 函数 |
| Process timeout | Codex API 慢 | 增加 timeout 时间 |
| 输出乱码 | 编码问题 | 确保 UTF-8 编码 |
| 会话无上下文 | 历史消息未读取 | 检查 buildContextPrompt() |

### 6.3 性能优化建议

1. **上下文缓存**：
   - 缓存最近 N 轮对话，避免每次查询数据库
   - 使用 Redis 存储热点会话

2. **并发控制**：
   - 限制单个群聊并发请求数（1-2个）
   - 全局请求队列管理

3. **Token 管理**：
   - 监控 Token 有效期，提前刷新
   - 实现自动重试机制

---

## 七、风险评估与对策

### 7.1 技术风险

| 风险 | 可能性 | 影响 | 对策 |
|------|-------|------|------|
| Token 过期 | 中 | 高 | 定期刷新，环境变量备份 |
| gaccode API 限流 | 中 | 高 | 实现请求队列、错误重试 |
| 输出格式不兼容 | 低 | 中 | 增强输出解析逻辑 |
| 进程僵死 | 低 | 中 | 定时清理，监控告警 |

### 7.2 成本风险

- **gaccode API 费用**：需确认计费模式
- **服务器资源**：Codex 进程占用内存约 200-500MB
- **并发限制**：建议设置单群聊并发上限

### 7.3 安全风险

- **Token 泄露**：已存储在 `~/.claudecode/config`，权限安全
- **跨租户访问**：飞书群聊权限隔离
- **恶意代码生成**：沙箱模式默认 read-only

---

## 八、后续优化方向

### 8.1 功能增强

1. **智能路由**：
   - 根据问题类型自动选择 Claude 或 Codex
   - 编程类问题 → Codex
   - 通用对话 → Claude

2. **协作模式**：
   - Claude 负责架构设计
   - Codex 负责代码实现
   - 自动协调两个模型的输出

3. **代码审查**：
   - Claude Review Codex 生成的代码
   - 提供安全性和最佳实践建议

### 8.2 从方案 C 升级到方案 B

当稳定运行 1-2 个月后，可以考虑迁移到完整版：
- 使用交互模式，进程常驻
- 真正的会话持久化
- 更完整的上下文管理

---

## 九、总结

### 9.1 核心结论

✅ **技术可行性**: 100% 可行，Codex CLI 已验证可用
✅ **实现难度**: 低，主要是复制和适配工作
✅ **投入产出比**: 高，新增功能价值显著

### 9.2 关键优势

1. **零基础设施改动**: 复用现有服务、数据库、会话管理
2. **一致的用户体验**: 与小六相同的交互模式
3. **灵活的扩展性**: 可轻松添加更多 AI 模型机器人
4. **成本可控**: 方案 C 无进程管理开销

### 9.3 开发时间估算

| 任务 | 预计时间 |
|------|---------|
| 创建 codex-cli.js | 30 分钟 |
| 创建 feishu-codex-proxy.js | 30 分钟 |
| 修改 index.js 和 webhook.js | 15 分钟 |
| 测试和调试 | 45 分钟 |
| **总计** | **2 小时** |

### 9.4 下一步行动

1. ✅ 创建 `server/codex-cli.js`
2. ✅ 创建 `server/routes/feishu-codex-proxy.js`
3. ✅ 修改 `server/index.js` 注册路由
4. ✅ （可选）修改 `server/feishu-webhook.js` 添加关键词路由
5. ✅ 本地测试验证
6. ⚠️  重启服务（提示用户手动执行）
7. ✅ 飞书群聊测试
8. ✅ 监控运行状态

---

## 参考资料

- [OpenAI Codex CLI 官方文档](https://developers.openai.com/codex/cli)
- [gaccode.com 文档](https://gaccode.com/)
- 本项目 `/home/ccp/CLAUDE.md` - 架构文档
- 本项目 `server/claude-cli.js` - Claude CLI 封装参考实现
- 本项目 `server/routes/feishu-proxy.js` - Proxy API 参考实现

---

**文档版本**: v2.0
**生成时间**: 2026-01-01
**作者**: Claude Opus 4.5
**状态**: ✅ 可用性已验证，待实施
