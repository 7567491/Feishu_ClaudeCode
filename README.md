# Claude Code UI

基于 [gaccode.com](https://gaccode.com) 的 Claude Code Web 界面，提供桌面和移动端的完整访问体验。

## ✨ 核心功能

- **📱 响应式设计** - 完美支持桌面、平板和移动设备
- **💬 智能聊天** - 实时流式对话，支持 Claude Sonnet 4.5
- **🖥️ 集成终端** - 内置 Shell 终端，直接访问 Claude Code CLI
- **📁 文件管理** - 交互式文件树，支持语法高亮和实时编辑
- **🔄 Git 集成** - 查看、暂存、提交更改，切换分支
- **🎯 会话管理** - 恢复对话，管理多个会话，追踪历史
- **🤖 飞书集成** - HTTP Webhook 模式接入飞书机器人，支持私聊和群聊
  - **重要**：必须使用 HTTP Webhook 模式（不要使用 WebSocket 长连接）
  - 飞书后台配置：事件与回调 → 订阅方式选择"将事件发送至开发者服务器"
  - Webhook 地址：`https://your-domain/webhook`
  - 文件发送/Markdown 转飞书文档：直接执行，无前后铺垫提示
  - 消息与文件请求去重：同一 message_id 跳过，短时间重复文件请求冷却处理
  - 智能路径解析：自动处理相对路径、绝对路径和复杂路径，防止路径重复拼接
  - Paper 文献检索：智能搜索学术论文并自动下载 PDF
- **👨‍🏫 AI初老师机器人** - Bot-to-Bot 协作模式
  - 菜单引导式开发：通过交互式菜单选择项目模板
  - 自动化应用生成：一键生成前端/全栈应用并部署
  - 会话持久化：支持多轮对话和上下文保持
  - 端口动态分配：自动管理用户项目端口（从 57001 起）

## 🏗️ 技术栈

- **后端:** Node.js + Express + HTTP Webhook + Feishu SDK (@larksuiteoapi/node-sdk v1.55.0)
- **前端:** React 18 + Vite + CodeMirror + Tailwind CSS
- **集成:** Claude CLI (gaccode 2.0.37) + SQLite 会话管理
- **AI初老师:** Python Flask + 会话持久化 (端口 33301)
- **部署:** Nginx + PM2 + SSL (Let's Encrypt)

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（参考下方）
cp .env.example .env

# 开发模式（同时启动前端和后端）
npm run dev

# 生产模式
npm run build && npm run server
```

## ⚡ 常用命令速查

```bash
# === 服务启动 ===
npm run server          # 主 API 服务 (端口 33300，包含飞书 Webhook)
cd teacher && python app.py  # AI初老师 (端口 33301)

# === PM2 生产部署 ===
pm2 start npm --name "claude-code-ui" -- run server  # 已包含飞书 Webhook
cd teacher && pm2 start ecosystem.config.cjs
pm2 save && pm2 startup  # 设置开机自启

# === 服务管理 ===
pm2 status              # 查看服务状态
pm2 logs [service]      # 查看实时日志
pm2 restart all         # 重启所有服务
pm2 stop all            # 停止所有服务
pm2 delete all          # 删除所有服务

# === 测试 ===
npm run test            # 服务器测试
npm run test:feishu     # 飞书集成测试
cd teacher && python -m pytest tests/  # AI初老师测试

# === 数据库管理 ===
sqlite3 server/database/auth.db "SELECT * FROM feishu_sessions;"
node server/show-processes.js --simple  # 查看 Claude 子进程

# === 工具脚本 ===
node server/send-all-pdf.js <目录> <chat_id>  # 批量发送 PDF 文件到飞书

# === 日志查看 ===
tail -f /home/ccp/teacher/feishu_bot.log  # AI初老师日志
pm2 logs --lines 100                       # 所有 PM2 日志
```

## 🔧 生产部署

```bash
# PM2 管理
pm2 start npm --name "claude-code-ui" -- run server  # 主服务 (端口 33300)
pm2 start npm --name "feishu" -- run feishu         # 飞书 WebSocket 服务
cd teacher && pm2 start ecosystem.config.cjs         # AI初老师 (端口 33301)
pm2 save

# PM2 常用命令
pm2 status              # 查看所有服务状态
pm2 logs [service]      # 查看服务日志
pm2 restart all         # 重启所有服务
pm2 stop all            # 停止所有服务

# Nginx 配置示例 (WebSocket 支持)
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:63080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

## 📋 环境变量

```bash
PORT=33300                              # 主服务端口
CLAUDE_CLI_PATH=claude                  # CLI 路径
ANTHROPIC_BASE_URL=https://gaccode.com/claudecode
FeishuCC_App_ID=cli_xxx                 # 飞书应用配置（WebSocket模式）
FeishuCC_App_Secret=xxx
Github_Token=github_pat_xxx             # GitHub Personal Access Token（用于仓库操作、PR管理等）
DEEPSEEK_API_KEY=sk-xxx                 # DeepSeek API（用于对话摘要）
```

**认证配置说明：**
- Claude 认证 token 自动从 `~/.claudecode/config` 读取（需先完成 `claude` CLI 登录）
- GitHub Token：从系统环境变量 `Github_Token` 中配置，用于 Git 仓库操作和 API 调用
- DeepSeek API Key：用于对话摘要功能

## 🤖 飞书集成

- **WebSocket 长连接模式**（稳定、实时），支持私聊和群聊
- 自动创建独立会话目录和 Git 仓库（`./feicc/user-{open_id}/`）
- 持久化会话历史，支持多轮对话上下文
- 私聊直接响应，群聊需 @ 机器人

**启动飞书服务：**
```bash
pm2 start npm --name "feishu" -- run feishu
pm2 logs feishu  # 查看日志
```

**查看子进程状态：**
```bash
# 快速查看（推荐）
node server/show-processes.js --simple

# 详细信息
node server/show-processes.js

# JSON格式
node server/show-processes.js --json
```

### 🗂️ 工作目录管理（重要）

每个飞书群聊绑定一个固定的工作目录（`project_path`），存储在数据库中。

**工作目录保护机制：**
- ✅ **cd 命令已禁用** - 防止运行时修改工作目录导致的状态不一致
- ✅ **只读原则** - `project_path` 在会话创建时确定，运行时不可修改
- ✅ **子目录访问** - 使用相对路径访问子目录（如 `ls subdir/`）

**查询群聊工作目录：**
```bash
sqlite3 server/database/auth.db "SELECT conversation_id, project_path FROM feishu_sessions WHERE session_type='group';"
```

**修改工作目录（需手动操作数据库）：**
```bash
# 1. 更新数据库
sqlite3 server/database/auth.db "UPDATE feishu_sessions SET project_path = '/new/path' WHERE id = <session_id>;"

# 2. 移动文件
cp -r /old/path/* /new/path/

# 3. 重启服务
pm2 restart feishu
```

### 📚 Paper 文献检索功能

飞书机器人支持智能文献检索和 PDF 下载功能，通过 `paper` 指令快速获取学术论文。

**使用方法：**
```
paper {关键词}
```

**功能流程：**
1. 调用 Claude 生成指定主题的文献综述
2. 返回包含作者、年份、论文名称、引用次数、期刊和中文翻译的论文表格
3. 自动下载论文 PDF 到当前工作目录的 `./pdf` 子目录
4. 通过飞书消息发送下载成功的 PDF 文件

**示例：**
```
paper 深度学习
paper 强化学习在机器人控制中的应用
```

**技术实现：**
- 论文表格解析：`server/lib/paper-command-handler.js`
- PDF 下载器：`server/lib/paper-downloader.js`
- Python 下载脚本：`server/lib/download-paper.py`
- 支持 arXiv、Google Scholar 等多个数据源
- 并发下载（最多 3 个），自动重试机制

**注意事项：**
- 下载可能需要 1-5 分钟，具体取决于论文数量和网络状况
- 部分论文可能因访问限制或版权原因无法下载
- PDF 文件保存在会话工作目录的 `pdf/` 子目录中

### 📤 批量发送 PDF 工具

提供独立的命令行工具，用于批量发送指定目录下的所有 PDF 文件到飞书聊天。

**使用方法：**
```bash
node server/send-all-pdf.js <目录> <chat_id>
```

**示例：**
```bash
# 发送所有 PDF 到私聊（user open_id）
node server/send-all-pdf.js ./thinking-fast-slow-papers ou_a56e25820913cc1ee1e0ea35d9ffb497

# 发送到群聊（group chat_id）
node server/send-all-pdf.js ./paper/lit/深度学习/pdf oc_8623156bb41f217a3822aca12362b068
```

**功能特性：**
- 自动扫描目录中的所有 `.pdf` 文件
- 显示文件大小和发送进度
- 内置速率限制保护（文件间隔 1.5 秒）
- 统计发送成功/失败数量
- 自动从数据库或环境变量读取飞书凭证

**注意事项：**
- 需要先配置好飞书应用凭证（`FeishuCC_App_ID` 和 `FeishuCC_App_Secret`）
- 大文件或大量文件可能需要较长时间
- 请确保有足够的 API 调用配额

### 📥 文件接收功能

用户在飞书对话框中发送文件时，机器人会自动下载并保存到工作目录。

**支持的文件类型：**
- 📄 普通文件（PDF、Word、Excel、TXT 等）
- 🖼️ 图片（PNG、JPG、GIF 等）
- 🎬 视频和音频文件

**使用方法：**
1. 在飞书对话框中直接发送文件（拖拽或点击发送）
2. 机器人自动下载文件到当前会话的工作目录
3. 收到确认消息，显示文件名、保存路径和文件大小

**响应示例：**
```
用户：[发送 report.pdf]

机器人：📥 收到文件，正在下载到工作目录...

机器人：✅ 文件已保存到工作目录：
📄 文件名：report.pdf
📂 路径：/home/ccp/feicc/user-ou_xxx/report.pdf
💾 大小：1234.56 KB
```

**技术实现：**
- 文件下载：`server/lib/feishu-client.js:1170-1264`
  - `downloadFile()` - 下载普通文件
  - `downloadImage()` - 下载图片
- 消息处理：`server/lib/feishu-client.js:103-190`
- 飞书服务集成：`server/feishu-ws.js:162-215`

**注意事项：**
- 文件大小受飞书 API 限制（通常单文件最大 100MB）
- 图片文件会自动生成时间戳文件名（如 `image_1701234567890.png`）
- 所有文件保存到当前会话的独立工作目录，确保数据隔离

### 🔌 Bot-to-Bot 集成：AI初老师 ⭐ 重要机器人代码

**场景：** 多个飞书机器人在同一个群里协作，AI初老师作为入口引导用户，小六负责实际开发任务。

**架构：**
```
用户 → AI初老师（菜单引导） → 小六API（Claude Code执行） → 群聊响应
```

**实现方式：**
- AI初老师使用HTTP API调用小六（`/api/feishu-proxy/query`）
- 不使用@方式（飞书平台不推送bot之间的消息）
- 小六接收API请求后在群里直接响应

**AI初老师服务管理：**
```bash
# 启动服务 (端口 33301)
cd teacher && python app.py

# 或使用 PM2 管理
cd teacher && pm2 start ecosystem.config.cjs

# 查看日志
tail -f /home/ccp/teacher/feishu_bot.log
pm2 logs ai-teacher  # PM2 日志

# 运行测试
cd teacher && python -m pytest tests/

# 查看配置
cat teacher/port.csv      # 端口分配表
cat teacher/prompts.json  # 项目模板提示词
cat teacher/sessions.json # 会话持久化数据
```

**技术文档：**
- [Bot-to-Bot解决方案](docs/BOT_TO_BOT_SOLUTION.md)
- [AI初老师集成代码](docs/AI_TEACHER_INTEGRATION_CODE.md)
- [RCA分析](docs/RCA_BOT_TO_BOT_MESSAGE.md)

**关键代码位置：**
- **主程序：** `teacher/app.py` - Flask 应用入口
- **消息处理：** `teacher/lib/ai_teacher_handler.py` - 菜单和消息路由
- **会话管理：** `teacher/lib/session_manager.py` - 会话持久化
- **飞书客户端：** `teacher/lib/feishu_client.py` - API 调用封装
- **小六API端点：** `server/routes/feishu-proxy.js` - Bot-to-Bot 接口
- **提示词配置：** `teacher/prompts.json`
  - `1/2` 开头 = 前端单页应用
  - `3` 开头 = 全栈应用
  - 域名规则：`https://s.linapp.fun/{用户拼音}_{应用拼音}.html`
  - 文件存储：`/mnt/www/{用户拼音}_{应用拼音}.html`

## 📂 项目结构

```
/home/ccp/
├── server/                    # 后端核心服务
│   ├── index.js              # 主 API 服务器 (Express + WebSocket)
│   ├── feishu-webhook.js     # 飞书 Webhook 处理（已弃用）
│   ├── feishu-ws.js          # 飞书 WebSocket 服务（当前使用）
│   ├── database/             # SQLite 数据库
│   │   └── auth.db           # 会话、消息、用户数据
│   ├── lib/                  # 核心业务逻辑
│   │   ├── feishu-client.js  # 飞书 API 封装
│   │   ├── feishu-session.js # 会话管理
│   │   ├── paper-command-handler.js  # Paper 文献检索
│   │   ├── context-manager.js        # 混合上下文管理
│   │   └── filter-claude-output.js   # 输出过滤
│   └── routes/               # API 路由
│       └── feishu-proxy.js   # Bot-to-Bot API 端点
├── src/                      # React 前端源码
├── dist/                     # Vite 构建输出（生产）
├── feicc/                    # 飞书会话工作区（自动创建）
│   ├── user-*/               # 私聊工作目录
│   └── group-*/              # 群聊工作目录
├── teacher/                  # ⭐ AI初老师机器人（Python Flask）
│   ├── app.py                # Flask 应用入口
│   ├── lib/                  # 核心模块
│   │   ├── ai_teacher_handler.py    # 消息处理和菜单路由
│   │   ├── session_manager.py       # 会话持久化
│   │   └── feishu_client.py         # 飞书 API 客户端
│   ├── prompts.json          # 项目模板提示词
│   ├── port.csv              # 端口分配表
│   ├── sessions.json         # 会话数据持久化
│   └── tests/                # pytest 测试
├── scripts/                  # 维护脚本
├── test/                     # 集成测试
├── docs/                     # 技术文档和 RCA 分析
├── backups/                  # 系统备份（iptables、crontab）
├── logs/                     # 应用日志
├── .claude/                  # Claude CLI 配置
├── .claude-logs/             # Claude 临时文件（TMPDIR 重定向）
└── .pm2/logs/                # PM2 服务日志
```

## 🔗 目录耦合关系

**feicc/ 目录：** 由主应用动态管理，每个飞书对话自动创建独立工作目录和 Git 仓库。路径硬编码在 `server/lib/feishu-session.js`，迁移项目时必须一起移动。

## 🔐 Git 管理规则

**重要：本项目只维护一个 Git 仓库**

- ✅ **唯一仓库位置：** `/home/ccp/.git`
- ❌ **禁止子目录建 Git：** `/home/ccp` 下的所有子目录（包括 `feicc/`、`server/`、`docs/` 等）不应创建独立的 Git 仓库
- 📤 **推送规则：** 所有代码提交和推送只能通过根目录的 Git 仓库进行

**GitHub 配置：**
```bash
# 远程仓库
Repository: https://github.com/7567491/Feishu_ClaudeCode.git

# 认证方式
使用系统环境变量 Github_Token 进行认证
export Github_Token=github_pat_xxxxx

# 提交示例
git add .
git commit -m "feat: 你的提交信息"
git push origin main
```

**注意事项：**
- 如果发现子目录中有 `.git` 文件或目录，应立即删除
- 所有代码变更必须在 `/home/ccp` 目录下进行版本控制
- `feicc/` 目录下的用户会话工作区不应包含独立的 Git 仓库

## 🔄 自动化维护

**定时清理：** Cron 每天 3:00 执行 `scripts/cleanup-temp-files.sh`
- 移动根目录 iptables 备份到 `backups/`，保留 7 天
- 清理 `.tmp*` 临时目录
- 清理 Claude CWD 和 `.lock` 文件

**手动清理：** `bash /home/ccp/scripts/cleanup-temp-files.sh`

## 📝 文件生成规则

所有运行时文件自动写入子目录，避免污染根目录：
- **数据库** → `server/database/auth.db`
- **临时文件** → `.claude-logs/` (通过 TMPDIR 环境变量)
- **日志** → `.pm2/logs/` 或 `logs/`
- **备份** → `backups/` (自动归档)
- **飞书会话** → `feicc/user-*/` 或 `feicc/group-*/`

**例外：** `.claude.json` 必须在根目录（Claude CLI 官方要求）

## 🛠️ 故障排查

```bash
# PM2 服务管理
pm2 status                            # 检查所有服务状态
pm2 logs claude-code-ui --lines 100   # 主服务日志
pm2 logs feishu --lines 100           # 飞书服务日志
pm2 logs ai-teacher --lines 100       # AI初老师日志
pm2 restart all                       # 重启所有服务

# 查看 Claude 子进程状态
node server/show-processes.js --simple

# 数据库诊断
sqlite3 server/database/auth.db "SELECT * FROM feishu_sessions ORDER BY last_activity DESC LIMIT 10;"
sqlite3 server/database/auth.db "SELECT conversation_id, project_path FROM feishu_sessions WHERE session_type='group';"

# 查看端口占用
lsof -i :33300  # 主服务
lsof -i :33301  # AI初老师

# 清理过期会话（谨慎使用）
sqlite3 server/database/auth.db "UPDATE feishu_sessions SET claude_session_id = NULL WHERE last_activity < datetime('now', '-24 hours');"

# AI初老师日志
tail -f /home/ccp/teacher/feishu_bot.log
```

## 🔧 会话管理与稳定性优化 ⭐ 最新

### 持久化对话上下文机制 ✅ 已验证

系统通过 **4 层架构** 实现完整的持久化对话上下文：

**核心机制**
- ✅ **数据库层**: SQLite 存储 `claude_session_id` 和会话元数据
- ✅ **会话管理层**: 自动创建/恢复会话，独立工作目录（`./feicc/user-*/`）
- ✅ **进程管理层**: Claude CLI 的 `--resume` 参数恢复历史上下文
- ✅ **消息流转层**: WebSocket + Proxy API 双模式支持

**工作原理**
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

**验证结果** (2025-11-28)
- ✅ 代码实现完整（TDD 测试验证）
- ✅ 数据库有真实 Session ID 记录
- ✅ 当前系统成功率: **100%**
- ✅ 27 个活跃会话，5 个保存了 Session ID

### 进程生命周期管理

系统已实现完整的 Claude CLI 子进程生命周期管理：

**信号处理增强**
- ✅ 完整处理 `SIGTERM`、`SIGINT`、`SIGKILL` 等进程信号
- ✅ 清晰的中文错误提示，准确反映终止原因
- ✅ 进程注册采用预注册机制，消除竞态条件

**服务重启后的会话恢复**
- ✅ 启动时自动清理过期的 `claude_session_id`（24小时未活跃）
- ✅ 运行时验证会话有效性，自动处理失效会话
- ✅ 数据库提供 `clearOldClaudeSessionIds()` 清理方法
- ✅ 失效会话自动清理，下次创建新会话

**典型修复场景**
```bash
# 场景1: PM2重启后飞书对话报错 "SIGINT 进程被用户中断"
# 原因：数据库中残留失效的 claude_session_id
# 修复：启动时自动清理，无需手动干预

# 场景2: 并发请求导致 "exit code null"
# 原因：进程注册存在竞态条件
# 修复：预注册机制，确保唯一性

# 场景3: 成功率统计显示 21.7%
# 原因：混合了已废弃系统的历史数据
# 验证：当前系统实际运行正常（100%）
```

### 相关技术文档
- [RCA: Exit Code Null 错误分析](docs/RCA_EXIT_CODE_NULL.md) - 竞态条件与信号处理
- [RCA: 服务重启后 SIGINT 错误](docs/RCA_SIGINT_AFTER_RESTART.md) - 会话生命周期管理
- [RCA: 服务重启问题分析](docs/RCA_SERVER_RESTART_ISSUE.md) - 完整的诊断过程
- [RCA: 成功率 21.7% 分析](docs/RCA_SUCCESS_RATE_21_PERCENT.md) - 5个为什么 + TDD验证 ⭐ 新增
- [持久化验证报告](test/VERIFICATION_SUMMARY.md) - 完整的TDD测试验证
- [5个为什么分析](test/RCA_5_WHYS_ANALYSIS.md) - 根因分析详细过程

### 健康检查工具
```bash
# 查看所有 Claude 子进程
node server/show-processes.js

# 检查数据库会话状态
sqlite3 server/database/auth.db "SELECT conversation_id, claude_session_id, is_active FROM feishu_sessions;"

# 查看成功率统计（正确方法）
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

## 📄 文档自动创建功能

### 功能特性

当 `/home/ccp` 目录下的 `.md` 文件被创建或修改时，系统会：
1. 自动读取Markdown内容
2. 创建飞书云文档
3. 转换Markdown格式为飞书Blocks
4. **自动设置公开访问权限**
5. 将文档链接发送到当前飞书对话

### 支持的Markdown格式

- ✅ 标题（H1-H3）
- ✅ 无序列表和有序列表
- ✅ 代码块（支持语言高亮）
- ✅ **粗体**、*斜体*、`行内代码`
- ⏳ 表格（计划中）
- ⏳ 图片（计划中）

### 使用示例

```bash
# 1. 启动飞书服务
npm run feishu

# 2. 在飞书中给bot发消息建立对话
"hi"

# 3. 创建或修改md文件
echo "# 我的文档\n\n这是内容" > test.md

# 4. 飞书自动收到：
# 📄 文档已创建：test
# 🔗 https://feishu.cn/docx/xxxxx
# ✅ 任何人都可以通过链接访问
```

### 配置选项

```javascript
// server/feishu-ws.js
this.fileWatcher = new FeishuFileWatcher(watchPath, {
  enabled: true,              // 启用文件监控
  sendAsDocument: true,       // true=文档，false=文件附件
  debounceDelay: 3000        // 防抖延迟（毫秒）
});
```

### 权限管理

文档创建后自动设置为"任何人可通过链接查看"，需要在飞书开放平台配置：
- ✅ `docx:document.create` - 创建文档
- ✅ `drive:drive.permission` - 管理文档权限⭐

### 相关文档

- [文档功能说明](docs/FEISHU_DOCUMENT_FEATURE.md)
- [权限问题RCA分析](docs/RCA_DOCUMENT_PERMISSION.md)
- [最终验证报告](docs/FINAL_VERIFICATION_REPORT.md)
- [执行总结](docs/EXECUTION_SUMMARY.md)

---

## 📄 License

MIT License

## 🙏 致谢

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic 官方 CLI
- [gaccode.com](https://gaccode.com) - Claude Code 代理服务
- 基于 [@siteboon/claude-code-ui](https://github.com/siteboon/claudecodeui) 修改

---

**最后更新**: 2025-12-07
**版本**: v2.7 (新增文件接收功能 + 完善项目文档)
