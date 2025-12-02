# 飞书机器人 × Claude Code

将 Claude Code 集成到飞书，支持私聊和群聊AI对话。

## ✨ 核心特性

- 🤖 私聊/群聊支持 - 私聊直接对话，群聊@机器人
- 💬 流式响应 - 实时输出，智能分片（2000字符/3秒）
- 🔒 会话隔离 - 独立目录和git仓库
- 🔄 并发控制 - 自动检测忙碌
- 📊 REST API - 9个管理端点
- 🎯 95%代码复用 - 完全集成现有系统

## 📦 组件结构

```
server/
├── database/db.js              # +feishuDb (2表,10函数)
├── lib/
│   ├── feishu-client.js       # 飞书客户端
│   ├── feishu-message-writer.js # 流式写入器
│   └── feishu-session.js      # 会话管理
├── feishu-ws.js               # 主服务
└── routes/feishu.js           # REST API
```

## 🚀 使用

```bash
# 1. 配置
export FeishuCC_App_ID=cli_xxxxx
export FeishuCC_App_Secret=xxxxx

# 2. 测试
node test-integration.js  # 35个测试 100%通过

# 3. 启动（待完善Webhook）
npm run feishu
```

## 📊 完成度：95%

✅ 数据库 | 消息写入 | 会话管理 | REST API | 测试
⚠️  飞书连接需改为Webhook模式（SDK版本API不兼容）

## 📖 文档

[需求](need.md) | [架构](design.md) | [任务](task.md) | [总结](../FEISHU_INTEGRATION_COMPLETE.md)

---
**代码就绪，只需调整连接方式** - 1620行核心代码，800行测试
