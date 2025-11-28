# Claude Code UI

基于 [gaccode.com](https://gaccode.com) 的 Claude Code Web 界面，提供桌面和移动端的完整访问体验。

## ✨ 核心功能

- **📱 响应式设计** - 完美支持桌面、平板和移动设备
- **💬 智能聊天** - 实时流式对话，支持 Claude Sonnet 4.5
- **🖥️ 集成终端** - 内置 Shell 终端，直接访问 Claude Code CLI
- **📁 文件管理** - 交互式文件树，支持语法高亮和实时编辑
- **🔄 Git 集成** - 查看、暂存、提交更改，切换分支
- **🎯 会话管理** - 恢复对话，管理多个会话，追踪历史
- **🤖 飞书集成** - WebSocket 模式接入飞书机器人，支持私聊和群聊

## 🏗️ 技术栈

- **后端:** Node.js + Express + WebSocket + Feishu WebSocket SDK (@larksuiteoapi/node-sdk v1.55.0)
- **前端:** React 18 + Vite + CodeMirror + Tailwind CSS
- **集成:** Claude CLI (gaccode 2.0.37) + SQLite 会话管理
- **部署:** Nginx + PM2 + SSL (Let's Encrypt)

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（参考下方）
cp .env.example .env

# 开发模式
npm run dev

# 生产模式
npm run build && npm run server
```

## 🔧 生产部署

```bash
# PM2 管理
pm2 start npm --name "claude-code-ui" -- run server
pm2 start npm --name "feishu" -- run feishu
pm2 save

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

### 🔌 Bot-to-Bot 集成：AI初老师

**场景：** 多个飞书机器人在同一个群里协作，AI初老师作为入口引导用户，小六负责实际开发任务。

**架构：**
```
用户 → AI初老师（菜单引导） → 小六API（Claude Code执行） → 群聊响应
```

**实现方式：**
- AI初老师使用HTTP API调用小六（`/api/feishu-proxy/query`）
- 不使用@方式（飞书平台不推送bot之间的消息）
- 小六接收API请求后在群里直接响应

**AI初老师代码：** `/home/ccp/teacher/`
```bash
# 查看AI初老师日志
tail -f /home/ccp/teacher/feishu_bot.log
```

**技术文档：**
- [Bot-to-Bot解决方案](docs/BOT_TO_BOT_SOLUTION.md)
- [AI初老师集成代码](docs/AI_TEACHER_INTEGRATION_CODE.md)
- [RCA分析](docs/RCA_BOT_TO_BOT_MESSAGE.md)

**关键代码位置：**
- API端点：`server/routes/feishu-proxy.js`
- AI初老师调用：`teacher/feishu_client.py:134` (`call_xiaoliu_api`)
- 消息处理：`teacher/message_handler.py:193-201`

## 📂 项目结构

```
/home/ccp/
├── server/            # 后端 API + 飞书集成 + SQLite 数据库
├── src/               # React 前端源码
├── dist/              # Vite 构建输出（生产）
├── feicc/             # 飞书会话隔离目录（自动创建 user-*/group-* 子目录）
├── teacher/           # AI初老师机器人代码（Python + Flask）
├── scripts/           # 维护脚本（cleanup-temp-files.sh 等）
├── test/              # 测试脚本
├── docs/              # 项目文档
├── backups/           # 备份文件（iptables、crontab）
├── logs/              # 应用日志
├── .claude/           # Claude CLI 数据
├── .claude-logs/      # Claude 临时文件（自动重定向）
└── .pm2/logs/         # PM2 服务日志
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
pm2 logs claude-code-ui --lines 100  # 查看日志
pm2 restart claude-code-ui            # 重启服务
pm2 status                            # 检查状态
```

## 🔧 会话管理与稳定性优化 ⭐ 最新

### 进程生命周期管理
系统已实现完整的 Claude CLI 子进程生命周期管理：

**信号处理增强**
- ✅ 完整处理 `SIGTERM`、`SIGINT`、`SIGKILL` 等进程信号
- ✅ 清晰的中文错误提示，准确反映终止原因
- ✅ 进程注册采用预注册机制，消除竞态条件

**服务重启后的会话恢复**
- ✅ 启动时自动清理过期的 `claude_session_id`
- ✅ 运行时验证会话有效性，自动处理失效会话
- ✅ 数据库提供 `clearAllClaudeSessionIds()` 清理方法

**典型修复场景**
```bash
# 场景1: PM2重启后飞书对话报错 "SIGINT 进程被用户中断"
# 原因：数据库中残留失效的 claude_session_id
# 修复：启动时自动清理，无需手动干预

# 场景2: 并发请求导致 "exit code null"
# 原因：进程注册存在竞态条件
# 修复：预注册机制，确保唯一性
```

### 相关技术文档
- [RCA: Exit Code Null 错误分析](docs/RCA_EXIT_CODE_NULL.md) - 竞态条件与信号处理
- [RCA: 服务重启后 SIGINT 错误](docs/RCA_SIGINT_AFTER_RESTART.md) - 会话生命周期管理
- [服务重启问题分析](docs/RCA_SERVER_RESTART_ISSUE.md) - 完整的诊断过程

### 健康检查工具
```bash
# 查看所有 Claude 子进程
node server/show-processes.js

# 检查数据库会话状态
sqlite3 server/database/auth.db "SELECT conversation_id, claude_session_id, is_active FROM feishu_sessions;"

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

**最后更新**: 2025-11-27
**版本**: v2.2 (Bot-to-Bot集成与AI初老师协作)
