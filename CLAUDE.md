# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言要求
用中文对话

## 基本原则
- 中文对话，用最简单的方法完成任务
- 不要创建新文件，除非明确被要求
- 优先编辑现有文件，避免创建新的文件（特别是文档文件）

## ⛔ 禁止执行的命令（重要）

**绝对禁止执行以下命令，这些命令会导致服务中断和其他用户会话丢失：**

```bash
# 禁止 PM2 服务管理命令
pm2 restart     # 会中断所有正在进行的对话
pm2 stop        # 会停止服务
pm2 delete      # 会删除服务
pm2 kill        # 会杀死 PM2 守护进程
pm2 start       # 可能导致配置冲突

# 禁止系统级命令
systemctl restart/stop  # 系统服务管理
kill/killall           # 进程终止
reboot/shutdown        # 系统重启
```

**替代方案：**
- 代码修改后告知用户"需要重启服务生效"，而不是自己执行重启
- 只读命令可用：`pm2 status`、`pm2 logs`

**🔐 管理员专属命令：**
- 张璐（`ou_a56e25820913cc1ee1e0ea35d9ffb497`）可通过私聊发送 `重启服务` 重启服务
- 管理员列表：`server/feishu-webhook.js:516` 的 `ADMIN_OPEN_IDS`

## 项目概览

Claude Code UI - 基于 Web 的飞书机器人集成界面。核心服务：
1. **主 API 服务** (端口 33300) - Express + HTTP Webhook + SQLite
2. **AI初老师** (端口 33301) - Python Flask 菜单引导服务

**MCP 服务：**
- **feishu-mcp** - 飞书 API（文档、多维表格、群聊）
  - 配置：`~/.claude.json`、Token：`~/.local/state/lark-mcp-nodejs/auth-store.json`
  - 自动刷新（已优化✨）：
    - 智能刷新：每 90 分钟自动检查并刷新 access_token
    - 强制刷新：每月 1/26 号刷新 refresh_token
    - 脚本：`/home/ccp/scripts/refresh-feishu-token.cjs`
  - 文档：`feishudoc/feishu-token-auto-refresh.md`（优化总结：`feishudoc/token-refresh-optimization-summary.md`）
  - **✅ Token 已自动维护，无需手动刷新**（如遇问题可手动执行：`node /home/ccp/scripts/refresh-feishu-token.cjs --force`）
- **automd-wechat** - Markdown 转微信公众号（`/home/ccp/mcp-servers/automd-wechat/`）
- **paper-research** - 学术论文搜索下载（`/home/ccp/mcp-servers/paper/`）
- **tavily** - AI 搜索引擎（实时资讯、新闻、行业研究）
  - 配置：`~/.claude.json`，API Key：`.env` 中的 `Tavily_API_Key`
  - 用法：直接在对话中请求搜索，如"搜索特斯拉最新财报消息"
- **wavespeed-mcp** - AI 图片生成（WaveSpeed API）
  - 源码：`/home/ccp/wave/wavespeed-mcp`
  - 配置：`~/.claude.json`，API Key：`.env` 中的 `Wavespeed_API_KEY`
  - 用法：通过 MCP 工具生成图片，支持文生图、图生图等功能
  - 文档：`wave/mcp.md`

## 常用命令

```bash
# 开发
npm run dev            # 同时启动前后端
npm run server         # 主服务 (端口 33300)
cd teacher && python app.py  # AI初老师 (端口 33301)

# 只读管理
pm2 status            # 查看服务状态
pm2 logs [service]    # 查看日志
node server/show-processes.js --simple  # 查看 Claude 子进程

# MCP Token 刷新
node /home/ccp/scripts/refresh-feishu-token.cjs  # 手动刷新飞书 Token

# 飞书文档操作（详见 feishudoc/README.md）
node feishudoc/create-folders.cjs               # 创建9个分类文件夹
node feishudoc/move-docs.cjs --limit 10 --dry-run  # 预览移动计划
node feishudoc/move-docs.cjs --limit 10         # 批量移动文档
node feishudoc/verify-move-results.cjs          # 验证移动结果

# 创建飞书文档（详见 feishudoc/create-document-guide.md）
node feishudoc/create-document.cjs --title "标题" --content "内容" --receiver "open_id"

# 读取飞书多维表格（详见 feishudoc/read-bitable-guide.md）
node feishudoc/read-bitable.mjs                 # 读取多维表格并生成分析报告
```

## 核心架构

### 飞书集成模式
- **HTTP Webhook** (必须)：`server/feishu-webhook.js` → `server/index.js` 的 `/webhook` 路由
- **Bot-to-Bot**：AI初老师 → `POST /api/feishu-proxy/query` → 小六(Claude)

### 会话持久化机制
- 首次对话：spawn Claude → 捕获 session_id → 保存数据库 `feishu_sessions`
- 后续对话：`claude --resume={session_id}` → 自动恢复上下文
- 服务重启：自动清理过期会话（24小时）

### 数据库 (SQLite: `server/database/auth.db`)
- `feishu_sessions` - 会话管理，`claude_session_id` 持久化
- `feishu_message_log` - 消息历史
- `feishu_credentials` - API 密钥
- `users` - 用户认证

### 飞书群聊工作目录（重要）

**当前映射：**
| 群聊名称 | chat_id | 工作目录 |
|---------|---------|----------|
| 1-市场活动 | `oc_8623156bb41f217a3822aca12362b068` | `/home/event` |
| 文献综述 | `oc_952d27558236925146ef1cce0ead924b` | `/home/lit` |

**保护机制：**
- ❌ `cd` 命令已禁用（`server/feishu-ws.js:314-323`）
- ✅ 使用相对路径访问子目录：`ls subdir/`、`cat subdir/file.txt`
- 🔧 修改工作目录：手动更新数据库 `UPDATE feishu_sessions SET project_path = '/new/path' WHERE conversation_id = 'group-oc_xxx';`

## 飞书功能速查

**⚠️ 飞书文档操作规则：**
- 所有飞书文档操作（搜索、读取、创建、编辑）必须使用飞书 MCP
- 操作前必须先刷新 Token：`node /home/ccp/scripts/refresh-feishu-token.cjs`
- 禁止直接使用 HTTP API，统一通过 MCP 工具调用

- **上下文命令**：`/clear`（清空）、`/status`（查看）- `server/feishu-webhook.js:38-52`
- **多维表格**：
  - 自动识别 URL 并读取（`server/lib/feishu-client.js:1586+`）
  - 脚本读取和分析：详见 `feishudoc/read-bitable-guide.md`
  - 示例脚本：`node feishudoc/read-bitable.mjs`
- **Paper 检索**：`paper {关键词}` → 生成综述 + 下载 PDF（`paper/lib/handler.js`）
- **Markdown 转文档**：监控 `.md` 文件自动创建飞书文档（`server/lib/feishu-file-watcher.js`）
- **批量发送 PDF**：`node server/send-all-pdf.js <目录> <chat_id>`
- **创建文档**：详见 `feishudoc/create-document-guide.md`，使用脚本：`node feishudoc/create-document.cjs`

## 环境变量

`.env` 文件必需配置：
```bash
PORT=33300
FeishuCC_App_ID=cli_xxx
FeishuCC_App_Secret=xxx
Github_Token=github_pat_xxx
DEEPSEEK_API_KEY=sk-xxx        # 对话摘要
TUSHARE_API_KEY=xxx            # 金融数据
Wavespeed_API_KEY=xxx          # AI 图片生成
```

Claude 认证：`~/.claudecode/config`

## Git 管理

- ✅ 仓库：`/home/ccp/.git`
- ❌ 禁止在子目录创建独立仓库
- 📤 远程：`https://github.com/7567491/Feishu_ClaudeCode.git`

## 文件生成规则

所有运行时文件写入子目录，避免污染根目录：
- 数据库 → `server/database/auth.db`
- 临时文件 → `.claude-logs/`
- 日志 → `.pm2/logs/` 或 `logs/`
- 飞书会话 → `feicc/user-*/` 或 `feicc/group-*/`
- 飞书文档分类 → `feishudoc/`（包含分类脚本、规则、文档）
- 例外：`.claude.json` 必须在根目录（Claude CLI 要求）

## 关键文件路径

| 路径 | 说明 |
|------|------|
| `server/index.js` | 主 API 服务器 (端口 33300) |
| `server/feishu-webhook.js` | 飞书 Webhook 处理器 |
| `server/lib/feishu-client.js` | 飞书 API 封装 |
| `server/lib/feishu-session.js` | 会话管理和数据库 |
| `server/routes/feishu-proxy.js` | Bot-to-Bot API |
| `teacher/app.py` | AI初老师 Flask 入口 (端口 33301) |
| `paper/lib/handler.js` | Paper 文献检索主处理器 |
| `~/.claude.json` | MCP 配置文件 |
| `~/.local/state/lark-mcp-nodejs/auth-store.json` | 飞书 Token 存储 |
| `scripts/refresh-feishu-token.cjs` | Token 自动刷新脚本 |
| `server/database/auth.db` | SQLite 数据库 |
| `feishudoc/` | 飞书文档操作工具（分类整理、创建文档、读取多维表格、Token 管理）<br>- `feishudoc/README.md` - 分类整理指南<br>- `feishudoc/create-document-guide.md` - 文档创建指南<br>- `feishudoc/read-bitable-guide.md` - 多维表格读取指南<br>- `feishudoc/read-bitable.mjs` - 多维表格分析脚本<br>- `feishudoc/feishu-token-auto-refresh.md` - Token 自动刷新详细文档<br>- `feishudoc/token-refresh-optimization-summary.md` - Token 优化总结 |

详细目录结构和故障排查见 `docs/` 目录。