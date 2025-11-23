# Claude Code UI

基于 [gaccode.com](https://gaccode.com) 的 Claude Code Web 界面，提供桌面和移动端的完整访问体验。

## 🌐 访问地址

**生产环境：** https://ccui.linapp.fun

## ✨ 核心功能

- **📱 响应式设计** - 完美支持桌面、平板和移动设备
- **💬 智能聊天** - 实时流式对话，支持 Claude Sonnet 4.5
- **🖥️ 集成终端** - 内置 Shell 终端，直接访问 Claude Code CLI
- **📁 文件管理** - 交互式文件树，支持语法高亮和实时编辑
- **🔄 Git 集成** - 查看、暂存、提交更改，切换分支
- **🎯 会话管理** - 恢复对话，管理多个会话，追踪历史

## 🏗️ 技术架构

**后端:**
- Node.js + Express (端口: 63080)
- WebSocket 实时通信
- 本地 Claude CLI 集成 (gaccode 版本 2.0.37)
- PM2 进程管理

**前端:**
- React 18 + Vite
- CodeMirror 代码编辑器
- Tailwind CSS

**部署:**
- Nginx 反向代理 + SSL (Let's Encrypt)
- 认证: `~/.claudecode/config` (gaccode token)

## 🚀 本地开发

### 环境要求

- Node.js v20+
- gaccode Claude Code CLI 已安装并认证

### 安装依赖

```bash
npm install
```

### 配置环境

```bash
cp .env.example .env
# 编辑 .env 设置端口等配置
```

### 启动开发服务器

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build
npm run server
```

## 🔧 生产部署

### PM2 管理

```bash
# 启动服务
pm2 start npm --name "claude-code-ui" -- run server

# 查看状态
pm2 status

# 查看日志
pm2 logs claude-code-ui

# 重启服务
pm2 restart claude-code-ui

# 停止服务
pm2 stop claude-code-ui

# 保存配置
pm2 save
```

### Nginx 配置示例

```nginx
server {
    server_name ccui.linapp.fun;

    location / {
        proxy_pass http://127.0.0.1:63080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/ccui.linapp.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ccui.linapp.fun/privkey.pem;
}
```

## 📋 环境变量

```bash
# 服务端口
PORT=63080

# Claude Code CLI 路径（可选）
CLAUDE_CLI_PATH=claude

# 上下文窗口大小
CONTEXT_WINDOW=160000

# gaccode 代理地址（自动继承）
ANTHROPIC_BASE_URL=https://gaccode.com/claudecode
```

## 🔐 认证说明

系统自动从 `~/.claudecode/config` 读取 gaccode 认证 token。确保：

1. 已安装 gaccode 版本的 Claude Code
2. 已完成 gaccode 认证登录
3. `~/.claudecode/config` 包含有效 token

## 📂 项目结构

```
.
├── server/           # Express 后端
│   ├── claude-cli.js # Claude CLI 封装
│   ├── index.js      # 主服务器
│   └── routes/       # API 路由
├── src/              # React 前端源码
├── dist/             # 构建产物
└── .env              # 环境配置
```

## 🛠️ 故障排查

**日志查看：**
```bash
pm2 logs claude-code-ui --lines 100
```

**重启服务：**
```bash
pm2 restart claude-code-ui
```

**检查进程：**
```bash
pm2 status
ps aux | grep node
```

## 📄 License

MIT License

## 🙏 致谢

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic 官方 CLI
- [gaccode.com](https://gaccode.com) - Claude Code 代理服务
- 基于 [@siteboon/claude-code-ui](https://github.com/siteboon/claudecodeui) 修改
