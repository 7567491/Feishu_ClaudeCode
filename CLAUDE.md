# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言要求
用中文对话

## 基本原则
- 中文对话，用最简单的方法完成任务
- 不要创建新文件，除非明确被要求
- 优先编辑现有文件，避免创建新的文件（特别是文档文件）

## 项目概览

这是 Claude Code UI - 基于 Web 的 Claude Code CLI 界面，集成飞书机器人支持。包含两个核心服务：
1. **主 API 服务** (端口 33300) - Express + HTTP Webhook + SQLite
2. **AI初老师机器人** (端口 33301) - Python Flask 菜单引导服务

**MCP 服务 (Model Context Protocol):**
- **automd-wechat** - Markdown 转微信公众号发布服务 (`/home/ccp/mcp-servers/automd-wechat/`)
  - 提供标准 MCP 接口，供所有用户使用
  - 每个用户独立配置微信公众号凭据
  - 文档: `/home/ccp/mcp-servers/automd-wechat/README.md`

## 常用开发命令

```bash
# 开发模式（同时启动前端和后端）
npm run dev

# 单独启动服务
npm run server          # 主 API 服务 (端口 33300，包含飞书 Webhook)
cd teacher && python app.py  # AI初老师机器人 (端口 33301)

# 构建和生产部署
npm run build          # 构建前端
pm2 start npm --name "claude-code-ui" -- run server  # 已包含飞书 Webhook
cd teacher && pm2 start ecosystem.config.cjs

# 测试
npm run test           # 服务器测试
npm run test:feishu    # 飞书集成测试
cd teacher && python -m pytest tests/  # AI初老师测试

# PM2 管理
pm2 status            # 查看服务状态
pm2 logs [service]    # 查看日志
pm2 restart all       # 重启所有服务

# 查看 Claude 子进程状态
node server/show-processes.js --simple

# 批量发送 PDF 文件到飞书
node server/send-all-pdf.js <目录> <chat_id>

# MCP 服务管理
bash /home/ccp/mcp-servers/automd-wechat/install.sh        # 安装 automd-wechat MCP 服务
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh  # 配置微信凭据
python3 /home/ccp/mcp-servers/automd-wechat/test-mcp.py   # 测试 MCP 服务
```

## 核心架构

### ⚠️ 飞书集成模式（重要）

**必须使用 HTTP Webhook 模式，不要使用 WebSocket 长连接！**

飞书开放平台配置：
1. 事件与回调 → 事件配置
2. 订阅方式：**将事件发送至开发者服务器**（不是"使用长连接"）
3. 请求地址：`https://ccode.linapp.fun/webhook`
4. 订阅事件：`im.message.receive_v1`

技术说明：
- Webhook 处理器：`server/feishu-webhook.js`
- 集成到主服务：`server/index.js` 的 `/webhook` 路由
- 无需独立的飞书服务进程，主服务已包含 Webhook 功能

### Bot-to-Bot 集成模式（重要）
```
用户 → AI初老师 → 处理菜单选择 → HTTP POST /api/feishu-proxy/query → 小六(Claude) → 群聊响应
```

关键实现：
- API 端点：`server/routes/feishu-proxy.js`
- AI初老师调用：`teacher/lib/feishu_client.py:134` (call_xiaoliu_api)
- 消息处理：`teacher/lib/ai_teacher_handler.py`
- 会话管理：`teacher/lib/session_manager.py`

### 数据库结构 (SQLite)
- `feishu_sessions` - 会话管理，存储 `claude_session_id` 实现上下文持久化
- `feishu_message_log` - 消息历史记录
- `feishu_credentials` - API 密钥存储
- `users` - 用户认证信息

### 会话持久化机制
- 首次对话：创建会话 → spawn Claude → 捕获 session_id → 保存数据库
- 后续对话：读取 session_id → `claude --resume={session_id}` → 自动恢复上下文
- 服务重启：自动清理过期会话（24小时未活跃）

### 文件系统约定
```
/home/ccp/
├── feicc/              # 飞书会话隔离目录（自动创建 user-*/group-*）
├── server/database/    # SQLite 数据库文件
├── .claude-logs/       # Claude CLI 临时文件
├── /mnt/www/          # 静态文件托管（AI初老师生成的应用）
└── teacher/sessions.json  # AI初老师会话持久化
```

### 飞书群聊与工作目录对应关系

每个飞书群聊绑定一个固定的工作目录（`project_path`），存储在 `feishu_sessions` 表中。

**当前群聊目录映射：**

| 群聊名称 | chat_id | 工作目录 |
|---------|---------|----------|
| 1-市场活动 | `oc_8623156bb41f217a3822aca12362b068` | `/home/event` |
| 文献综述 | `oc_952d27558236925146ef1cce0ead924b` | `/home/lit` |

**工作目录保护机制：**

> **背景 (RCA 2024-12-04)**：原 `cd` 命令实现存在缺陷，只更新内存中的 `session.project_path`，未持久化到数据库。导致服务重启后状态不一致，文件被创建到错误目录。

**已实施的防护措施：**

1. **禁用 cd 命令** (`server/feishu-ws.js:314-323`)
   ```javascript
   // cd 命令现在返回提示而非修改目录
   if (firstWord === 'cd') {
     await this.client.sendTextMessage(chatId,
       `⚠️ cd 命令已禁用，工作目录固定为：\`${session.project_path}\`\n` +
       `如需在子目录执行命令，请使用相对路径，如：\`ls subdir/\``
     );
     return;
   }
   ```

2. **工作目录只读原则**
   - `project_path` 在会话创建时由 `getOrCreateSession()` 确定
   - 运行时不允许任何代码修改 `session.project_path`
   - 数据库中无 `updateProjectPath` 函数（有意为之）

3. **子目录访问替代方案**
   - 使用相对路径：`ls subdir/`、`cat subdir/file.txt`
   - Claude 可自由在子目录创建/读取文件，但基础目录不变

**如需更改工作目录，必须手动操作数据库：**
```sql
UPDATE feishu_sessions SET project_path = '/new/path' WHERE conversation_id = 'group-oc_xxx';
```

**查询群聊工作目录：**
```bash
sqlite3 server/database/auth.db "SELECT conversation_id, project_path FROM feishu_sessions WHERE session_type='group';"
```

**修改群聊工作目录步骤：**
1. 更新数据库：`UPDATE feishu_sessions SET project_path = '/new/path' WHERE id = <session_id>;`
2. 移动文件：`cp -r /old/path/* /new/path/`
3. 重启服务：`pm2 restart feishu`

## 飞书集成要点

### Paper 文献检索功能
飞书机器人支持智能文献检索和 PDF 下载，通过 `paper` 命令快速获取学术论文。

**使用方法：**
```
paper {关键词}
```

**功能流程：**
1. 调用 Claude 生成指定主题的文献综述
2. 返回包含作者、年份、论文名称、引用次数、期刊和中文翻译的论文表格
3. 自动下载论文 PDF 到 `./paper/lit/{关键词}/pdf/` 目录
4. 通过飞书消息发送下载成功的 PDF 文件和综述文档

**技术实现（v2.0 模块化架构）：**
- 主处理器：`paper/lib/handler.js` (PaperHandler)
- Claude 子进程封装：`paper/lib/claude-client.js` (ClaudeClient)
- 论文表格解析：`paper/lib/parser.js` (PaperParser)
- PDF 下载器：`paper/lib/downloader.js` (PaperDownloader)
- Python 下载脚本：`paper/lib/download-paper.py`
- 并发下载（最多 3 个），自动重试机制
- 单元测试：`paper/tests/parser.test.js` (7/7 通过 ✅)

**提示词配置（v2.1 配置化架构）：**
- ✅ **配置目录**：`paper/prompts/`
- ✅ **模板文件**：`review-generation.txt` （文献综述生成提示词）
- ✅ **设计原则**：参考 `/home/lit` 项目的专业标准
- ✅ **关键特性**：
  - 精简高效（3000字以内）
  - 4个结构化章节（背景、方法、进展、未来）
  - 精选 5篇 最具影响力的核心文献
  - Markdown表格输出（适配飞书文档）
- ✅ **配置方式**：编辑 `paper/prompts/review-generation.txt` 后重启服务
- 📖 **详细文档**：`paper/prompts/README.md`

**文件存储规则：**
- 综述文件：`./paper/lit/{关键词}/{关键词}_文献综述.md`
- PDF 文件：`./paper/lit/{关键词}/pdf/*.pdf`
- 按关键词自动分类存储，便于管理

**注意事项：**
- 下载可能需要 1-5 分钟，具体取决于论文数量和网络状况
- 部分论文可能因访问限制或版权原因无法下载
- 已下载的文件不会重复下载（基于文件名去重）
- 详细文档见 `paper/README.md`

### 批量发送 PDF 工具
提供 `send-all-pdf.js` 脚本用于批量发送 PDF 文件到飞书。

**使用方法：**
```bash
node server/send-all-pdf.js <目录> <chat_id>

# 示例：发送所有论文 PDF 到私聊
node server/send-all-pdf.js ./thinking-fast-slow-papers ou_xxx

# 示例：发送到群聊
node server/send-all-pdf.js ./paper/lit/深度学习/pdf oc_xxx
```

**功能特性：**
- 自动扫描目录中的所有 `.pdf` 文件
- 显示文件大小和发送进度
- 速率限制保护（1.5秒间隔）
- 统计成功/失败数量

### Markdown 文档自动创建
当工作目录下的 `.md` 文件被创建或修改时，系统会：
1. 自动读取 Markdown 内容
2. 创建飞书云文档
3. 转换 Markdown 格式为飞书 Blocks
4. 自动设置公开访问权限
5. 将文档链接发送到当前飞书对话

**支持的格式：**
- ✅ 标题（H1-H3）、列表、代码块
- ✅ **粗体**、*斜体*、`行内代码`

**配置选项：**（已集成到 `server/feishu-webhook.js`）
```javascript
// 文件监控功能已内置到主服务中
// 可在 server/feishu-webhook.js 中配置相关参数
```

**权限要求：**
- ✅ `docx:document.create` - 创建文档
- ✅ `drive:drive.permission` - 管理文档权限

### AI初老师配置
- 端口分配表：`teacher/port.csv` (从 57001 开始)
- 项目模板提示词：`teacher/prompts.json`
- 命名规则：`{用户拼音}_{应用拼音}.html`
- 访问域名：`https://s.linapp.fun/{用户拼音}_{应用拼音}.html`

## 环境变量配置

必需的环境变量（`.env` 文件）：
```bash
PORT=33300
FeishuCC_App_ID=cli_xxx          # 飞书应用 ID
FeishuCC_App_Secret=xxx          # 飞书应用密钥
Github_Token=github_pat_xxx      # GitHub API Token
DEEPSEEK_API_KEY=sk-xxx         # DeepSeek API (对话摘要)
TUSHARE_API_KEY=xxx             # Tushare Pro API (金融数据)
```

Claude 认证从 `~/.claudecode/config` 自动读取

## Git 管理规则

**重要：只维护根目录的单一 Git 仓库**
- ✅ 仓库位置：`/home/ccp/.git`
- ❌ 禁止在子目录创建独立 Git 仓库
- 📤 GitHub 远程：`https://github.com/7567491/Feishu_ClaudeCode.git`

## 调试和故障排查

```bash
# 查看会话状态
sqlite3 server/database/auth.db "SELECT * FROM feishu_sessions ORDER BY last_activity DESC LIMIT 10;"

# 查看 AI初老师日志
tail -f teacher/feishu_bot.log

# 检查端口占用
lsof -i :33300  # 主服务
lsof -i :33301  # AI初老师

# 手动清理过期会话（谨慎）
sqlite3 server/database/auth.db "UPDATE feishu_sessions SET claude_session_id = NULL WHERE last_activity < datetime('now', '-24 hours');"
```

## 会话管理与稳定性

### 持久化对话上下文机制
系统通过 **4 层架构** 实现完整的持久化对话上下文：

**核心机制：**
- ✅ **数据库层**：SQLite 存储 `claude_session_id` 和会话元数据
- ✅ **会话管理层**：自动创建/恢复会话，独立工作目录（`./feicc/user-*/`）
- ✅ **进程管理层**：Claude CLI 的 `--resume` 参数恢复历史上下文
- ✅ **消息流转层**：WebSocket + Proxy API 双模式支持

**工作原理：**
```bash
# 首次对话
用户消息 → 创建 Session (claude_session_id = null)
         → spawn('claude', ['-p', 'prompt'])
         → 捕获 session_id → 保存到数据库

# 后续对话
用户消息 → 读取 Session (claude_session_id = 'abc-123')
         → spawn('claude', ['-p', '--resume=abc-123', 'prompt'])
         → Claude 自动加载历史上下文 ✅
```

### 进程生命周期管理

**信号处理增强：**
- ✅ 完整处理 `SIGTERM`、`SIGINT`、`SIGKILL` 等进程信号
- ✅ 清晰的中文错误提示，准确反映终止原因
- ✅ 进程注册采用预注册机制，消除竞态条件

**服务重启后的会话恢复：**
- ✅ 启动时自动清理过期的 `claude_session_id`（24小时未活跃）
- ✅ 运行时验证会话有效性，自动处理失效会话
- ✅ 失效会话自动清理，下次创建新会话

**典型修复场景：**
```bash
# 场景1: PM2 重启后飞书对话报错 "SIGINT 进程被用户中断"
# 原因：数据库中残留失效的 claude_session_id
# 修复：启动时自动清理，无需手动干预

# 场景2: 并发请求导致 "exit code null"
# 原因：进程注册存在竞态条件
# 修复：预注册机制，确保唯一性
```

### 健康检查工具
```bash
# 查看所有 Claude 子进程
node server/show-processes.js --simple

# 检查数据库会话状态
sqlite3 server/database/auth.db "SELECT conversation_id, claude_session_id, is_active FROM feishu_sessions;"

# 查看成功率统计
sqlite3 server/database/auth.db "
SELECT
  s.id,
  COUNT(CASE WHEN m.direction='incoming' THEN 1 END) as requests,
  COUNT(CASE WHEN m.direction='outgoing' THEN 1 END) as responses,
  ROUND(COUNT(CASE WHEN m.direction='outgoing' THEN 1 END) * 100.0 /
        NULLIF(COUNT(CASE WHEN m.direction='incoming' THEN 1 END), 0), 1) as rate
FROM feishu_sessions s
JOIN feishu_message_log m ON s.id = m.session_id
GROUP BY s.id
HAVING requests > 0
ORDER BY s.last_activity DESC
LIMIT 10;
"

# 手动清理过期会话（谨慎使用）
sqlite3 server/database/auth.db "UPDATE feishu_sessions SET claude_session_id = NULL WHERE claude_session_id IS NOT NULL;"
```

### 相关技术文档
- [RCA: Exit Code Null 错误分析](docs/RCA_EXIT_CODE_NULL.md)
- [RCA: 服务重启后 SIGINT 错误](docs/RCA_SIGINT_AFTER_RESTART.md)
- [RCA: 服务重启问题分析](docs/RCA_SERVER_RESTART_ISSUE.md)
- [RCA: SIGINT错误与飞书连接失败 (2025-12-13)](docs/RCA_SIGINT_20251213.md) ⭐️ 最新
- [RCA: SIGINT修复总结 (2025-12-13)](docs/RCA_SIGINT_20251213_SUMMARY.md)
- [持久化验证报告](test/VERIFICATION_SUMMARY.md)

## 自动化维护

**定时清理**：Cron 每天 3:00 执行 `scripts/cleanup-temp-files.sh`
- 移动根目录 iptables 备份到 `backups/`，保留 7 天
- 清理 `.tmp*` 临时目录
- 清理 Claude CWD 和 `.lock` 文件

**手动清理**：`bash /home/ccp/scripts/cleanup-temp-files.sh`

**文件生成规则**：所有运行时文件自动写入子目录，避免污染根目录
- **数据库** → `server/database/auth.db`
- **临时文件** → `.claude-logs/` (通过 TMPDIR 环境变量)
- **日志** → `.pm2/logs/` 或 `logs/`
- **备份** → `backups/` (自动归档)
- **飞书会话** → `feicc/user-*/` 或 `feicc/group-*/`
- **例外**：`.claude.json` 必须在根目录（Claude CLI 官方要求）

## 重要文件路径速查

| 组件 | 路径 | 说明 |
|-----|------|------|
| 主 API 服务器 | `server/index.js` | Express + HTTP Webhook 服务器 |
| 飞书 Webhook 处理器 | `server/feishu-webhook.js` | 飞书 HTTP 回调处理（当前使用） |
| 飞书客户端 | `server/lib/feishu-client.js` | 飞书 API 封装 |
| 会话管理 | `server/lib/feishu-session.js` | 会话管理和数据库操作 |
| Paper 主处理器 | `paper/lib/handler.js` | Paper 文献检索主处理器 |
| Paper Claude 客户端 | `paper/lib/claude-client.js` | Claude 子进程封装 |
| Paper 解析器 | `paper/lib/parser.js` | 论文表格解析器 |
| Paper 下载器 | `paper/lib/downloader.js` | 并发下载和重试逻辑 |
| 文件监控 | `server/lib/feishu-file-watcher.js` | Markdown 自动转文档 |
| Bot-to-Bot API | `server/routes/feishu-proxy.js` | AI初老师调用接口 |
| AI初老师主程序 | `teacher/app.py` | Flask 应用入口 |
| AI初老师处理器 | `teacher/lib/ai_teacher_handler.py` | 菜单和消息路由 |
| 会话管理器 | `teacher/lib/session_manager.py` | 会话持久化 |
| 飞书客户端（Python） | `teacher/lib/feishu_client.py` | Bot-to-Bot 调用封装 |
| 批量发送工具 | `server/send-all-pdf.js` | 批量发送 PDF 到飞书 |
| 前端入口 | `src/App.jsx` | React 主组件 |
| 数据库 | `server/database/auth.db` | SQLite 数据库文件 |

## 关键目录结构

```
/home/ccp/
├── server/                    # 后端核心服务
│   ├── index.js              # 主 API 服务器 (端口 33300)
│   ├── feishu-webhook.js     # 飞书 HTTP Webhook 处理器
│   ├── database/             # SQLite 数据库
│   ├── lib/                  # 核心业务逻辑
│   └── routes/               # API 路由
├── teacher/                  # AI初老师机器人 (端口 33301)
│   ├── app.py                # Flask 应用入口
│   ├── lib/                  # 核心模块
│   ├── prompts.json          # 项目模板提示词
│   ├── port.csv              # 端口分配表
│   └── sessions.json         # 会话持久化数据
├── feicc/                    # 飞书会话工作区（自动创建）
│   ├── user-*/               # 私聊工作目录
│   └── group-*/              # 群聊工作目录
├── src/                      # React 前端源码
├── dist/                     # Vite 构建输出
├── docs/                     # 技术文档和 RCA 分析
├── scripts/                  # 维护脚本
├── .claude-logs/             # Claude 临时文件
└── .pm2/logs/                # PM2 服务日志
```