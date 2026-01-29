# 中文对话：仓库说明（Codex 对话指引）

## 语言与基本原则
- 中文交流，用最简单方法完成任务。
- 优先编辑现有文件，非必要不新建文件或目录。

## ⛔ 禁用命令
- 禁用：`pm2 restart/stop/delete/kill/start`、`systemctl restart/stop`、`kill/killall`、`reboot/shutdown`，以免中断服务和对话。
- 需要重启时提示用户操作；只读可用：`pm2 status`、`pm2 logs`。
- 管理员：张璐 `ou_a56e25820913cc1ee1e0ea35d9ffb497`（`server/feishu-webhook.js:516 ADMIN_OPEN_IDS`）。

## 项目概览
- 主 API（端口 33300）：Express + HTTP Webhook + SQLite，核心在 `server/`，共享库 `server/lib/`。
- AI 初老师（端口 33301）：Flask 服务在 `teacher/`，测试 `teacher/tests/`。
- 前端：React 18 + Tailwind 在 `src/`，共享逻辑 `src/utils/`、`src/contexts/`。
- 其他：`auto/`（自动化与 Bull workers）、`test/` & `feishu/`（Node 诊断）、`public/` 静态、`dist/` 构建、`scripts/` 运维、`feicc/` 运行时会话目录（勿提交）。

## MCP 与令牌
- feishu-mcp：配置 `~/.claude.json`，Token 缓存 `~/.local/state/lark-mcp-nodejs/auth-store.json`，脚本 `scripts/refresh-feishu-token.cjs`（文档 `feishudoc/feishu-token-auto-refresh.md`，优化总结 `feishudoc/token-refresh-optimization-summary.md`）。Token 已自动维护，异常时可手动 `node /home/ccp/scripts/refresh-feishu-token.cjs --force`。
- automd-wechat：`/home/ccp/mcp-servers/automd-wechat/`。
- paper-research：`/home/ccp/mcp-servers/paper/`。
- tavily：AI 搜索（`.env` 配置 `Tavily_API_Key`）。
- wavespeed-mcp：AI 图片生成（源码 `/home/ccp/wave/wavespeed-mcp`，`.env` 配置 `Wavespeed_API_KEY`，文档 `wave/mcp.md`）。

## 常用命令
```bash
npm run dev               # 前后端同启
npm run server            # 仅主服务
cd teacher && python app.py  # AI 初老师
pm2 status | pm2 logs     # 仅查看
node server/show-processes.js --simple
node /home/ccp/scripts/refresh-feishu-token.cjs  # 手动刷新 Token
```

## 会话与数据
- 会话持久化：首次 spawn Claude 记录 `claude_session_id` 入 SQLite `server/database/auth.db` 表 `feishu_sessions`；`claude --resume` 自动恢复。
- 数据库表：`feishu_sessions`、`feishu_message_log`、`feishu_credentials`、`users`。
- 飞书群聊映射：1-市场活动 → `/home/event`；文献综述 → `/home/lit`。禁止全局 `cd`，用相对路径访问；修改映射需手动更新 DB。
- 运行时文件：数据库、日志、会话写入子目录；`.claude.json` 必须在仓库根。

## 飞书功能与规则
- 所有飞书文档操作必须使用飞书 MCP，操作前先运行 `node /home/ccp/scripts/refresh-feishu-token.cjs`。
- 上下文命令：`/clear`、`/status`（`server/feishu-webhook.js:38-52`）。
- 多维表格：自动识别 URL（`server/lib/feishu-client.js:1586+`）；脚本 `feishudoc/read-bitable.mjs`，指南 `feishudoc/read-bitable-guide.md`。
- Paper 检索：`paper {关键词}` 生成综述 + 下载（`paper/lib/handler.js`）。
- Markdown 转文档：监控 `.md` 自动创建（`server/lib/feishu-file-watcher.js`）。
- 批量发送 PDF：`node server/send-all-pdf.js <目录> <chat_id>`；创建文档指南 `feishudoc/create-document-guide.md`，脚本 `feishudoc/create-document.cjs`。

## 编码与命名
- ESM JavaScript；React 函数组件 + hooks；缩进 2 空格，单引号，保留尾逗号。
- 状态放上下文/自定义 hook，复杂逻辑提取 helper；Tailwind 写在 JSX，公用 token 在 `src/index.css`。
- 按特性命名（如 `TaskList.jsx`、`feishu-session.js`），测试镜像源文件（`test-*.js`、`test_*.py`）。

## 测试
- Node 测试在 `test/`、`feishu/`；Python bot 测试在 `teacher/tests/`（pytest 风格）。
- 新逻辑补回归覆盖，外部依赖尽量 mock。提交前跑 `npm run test` 及相关套件。

## 环境与 Git
- `.env` 基于 `.env.example`，需 `PORT`、`FeishuCC_App_ID/Secret`、`Github_Token`、`DEEPSEEK_API_KEY`、`TUSHARE_API_KEY`、`Tavily_API_Key`、`Wavespeed_API_KEY` 等；勿提交密钥或运行产物（`logs/`、`feicc/`、`server/database/auth.db` 等）。
- 仓库位于 `/home/ccp/.git`，禁止子目录再建 git；遵循 conventional commits（`feat:`、`fix:` 等）。PR 需摘要、关联 issue、手测结果，UI 变更附截图。

## 文件生成与关键路径
- 运行时写入子目录：数据库 `server/database/auth.db`、临时 `.claude-logs/`、日志 `.pm2/logs/` 或 `logs/`、会话 `feicc/`。
- 核心路径：`server/index.js`、`server/feishu-webhook.js`、`server/lib/feishu-client.js`、`server/lib/feishu-session.js`、`server/routes/feishu-proxy.js`、`teacher/app.py`、`paper/lib/handler.js`、`~/.claude.json`、`~/.local/state/lark-mcp-nodejs/auth-store.json`、`scripts/refresh-feishu-token.cjs`、`feishudoc/`（含相关指南）。
