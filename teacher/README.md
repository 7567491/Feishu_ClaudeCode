# AI初老师 - 智能开发助手

## 概述

AI初老师是一个基于飞书平台的智能开发助手机器人，通过Bot-to-Bot架构与小六服务协作，提供开发、测试、调试、文档生成等智能化服务。

## 架构设计

### Bot-to-Bot集成架构

```
用户 → AI初老师（菜单引导） → HTTP API → 小六服务 → 群聊响应
```

- **AI初老师**：前端机器人，负责用户交互和任务分发
- **小六服务**：后端服务，负责调用Claude处理实际任务
- **通信方式**：HTTP API（绕过飞书不推送Bot间消息的限制）

## 核心功能

### 1. 快速开发
- 使用TDD（测试驱动开发）方式
- 自动生成测试用例
- 使用ultrathink深度思考最佳实践

### 2. 测试验证
- 编写完整的单元测试
- 生成测试覆盖率报告
- 自动修复发现的问题

### 3. 调试修复
- 智能定位问题
- 分析根本原因
- 提供修复方案

### 4. 文档生成
- 自动生成API文档
- 添加使用示例
- 生成最佳实践建议

### 5. 代码重构
- 提高代码可读性
- 消除重复代码
- 优化性能瓶颈

### 6. 代码分析
- 检查代码质量
- 分析性能问题
- 提供改进建议

## 文件结构

```
teacher/
├── README.md               # 本文档
├── requirements.txt        # 依赖包列表
├── start.sh               # 启动脚本
├── main.py                # 主程序
├── config/
│   └── config.py          # 配置管理
├── lib/
│   ├── __init__.py       # 模块初始化
│   ├── feishu_client.py  # 飞书客户端
│   └── message_handler.py # 消息处理器
└── tests/
    ├── test_feishu_client.py    # 客户端测试
    └── test_message_handler.py  # 处理器测试
```

## 安装部署

### 1. 环境要求

- Python 3.7+
- pip
- 飞书应用凭据

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
# 飞书应用凭据（必需）
export TEACHER_FEISHU_APP_ID='your_app_id'
export TEACHER_FEISHU_APP_SECRET='your_app_secret'

# 小六API配置（可选）
export XIAOLIU_API_URL='http://localhost:3011/api/feishu-proxy/query'
export XIAOLIU_API_KEY='your_api_key'  # 如果需要鉴权

# 服务配置（可选）
export TEACHER_WEBHOOK_PORT=8082
export LOG_LEVEL=INFO
```

### 4. 启动服务

```bash
# 启动服务
./start.sh start

# 停止服务
./start.sh stop

# 重启服务
./start.sh restart

# 运行测试
./start.sh test

# 查看日志
./start.sh logs
```

## API接口

### 1. Webhook接口
- **地址**: `/webhook/feishu`
- **方法**: POST
- **用途**: 接收飞书事件推送

### 2. 健康检查
- **地址**: `/health`
- **方法**: GET
- **响应**:
```json
{
  "status": "healthy",
  "service": "AI初老师",
  "version": "1.0.0"
}
```

### 3. 消息发送API
- **地址**: `/api/send`
- **方法**: POST
- **请求体**:
```json
{
  "message": "开发一个计算器",
  "chatId": "oc_xxx"  // 可选，默认为配置的群组
}
```

## 与小六的集成

AI初老师通过HTTP API调用小六服务：

- **端点**: `/api/feishu-proxy/query`
- **方法**: POST
- **请求格式**:
```json
{
  "message": "任务描述",
  "chatId": "群组ID",
  "fromBot": "AI初老师",
  "apiKey": "API密钥"  // 可选
}
```

## 测试

项目使用TDD开发方式，所有功能都有对应的测试用例：

```bash
# 运行所有测试
python -m pytest tests/ -v

# 运行特定测试
python -m pytest tests/test_feishu_client.py -v

# 生成覆盖率报告
python -m pytest tests/ --cov=lib --cov-report=html
```

## 开发理念

### TDD（测试驱动开发）
1. 先编写测试用例
2. 实现功能代码
3. 重构优化

### Ultrathink（深度思考）
- 充分考虑边界情况
- 优化算法和性能
- 遵循最佳实践

## 监控和日志

- 日志文件：`teacher.log`
- 日志级别：通过`LOG_LEVEL`环境变量配置
- 支持控制台和文件双输出

## 相关文件

- **服务端API**: `server/routes/feishu-proxy.js`
- **监控脚本**: `scripts/monitor-feishu-service.sh`
- **重启脚本**: `scripts/restart-feishu-daily.sh`
- **报告脚本**: `scripts/auto-send-report.sh`

## 群组信息

- **默认群组ID**: `oc_15a90daa813d981076ffa50c0de0b5e4`
- **用途**: 系统通知、监控告警、开发协作

## 故障排除

### 1. 服务无法启动
- 检查飞书凭据是否正确
- 检查端口是否被占用
- 查看日志文件：`tail -f teacher.log`

### 2. 消息发送失败
- 验证access_token是否有效
- 检查群组ID是否正确
- 确认网络连接正常

### 3. 小六API调用失败
- 确认小六服务正在运行
- 检查API地址是否正确
- 验证API密钥（如果需要）

## 未来计划

- [ ] 支持更多开发工具集成
- [ ] 添加代码审查功能
- [ ] 集成CI/CD流程
- [ ] 支持多语言开发
- [ ] 添加AI代码生成能力

## 贡献指南

欢迎贡献代码和建议！请遵循以下原则：

1. 使用TDD开发方式
2. 保持代码简洁清晰
3. 添加充分的测试用例
4. 更新相关文档

## 许可证

内部使用项目

## 联系方式

- 飞书群组：AI初老师工作群
- 项目维护：开发团队