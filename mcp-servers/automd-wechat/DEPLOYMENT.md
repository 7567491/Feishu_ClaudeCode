# AutoMD 微信公众号 MCP 服务 - 部署完成

## 🎉 已完成

已成功将 `/home/wexin/automd` 的代码和配置做成 MCP 服务，供本服务器所有用户使用。

## 📂 服务位置

```
/home/ccp/mcp-servers/automd-wechat/
```

## 📦 包含文件

| 文件 | 用途 | 大小 |
|-----|------|------|
| `server.py` | MCP 服务器主程序 | 8.8K |
| `setup-credentials.sh` | 凭据配置脚本 | 929B |
| `install.sh` | 一键安装脚本 | 1.3K |
| `test-mcp.py` | 测试工具 | 3.0K |
| `README.md` | 完整使用文档 | 5.2K |
| `EXAMPLES.md` | 使用示例 | 4.2K |
| `claudecode-config-example.json` | Claude Code 配置示例 | 276B |

## 🚀 快速开始（其他用户）

### 1. 一键安装

```bash
bash /home/ccp/mcp-servers/automd-wechat/install.sh
```

这将：
- ✅ 检查并安装 Python 依赖
- ✅ 引导用户配置微信公众号凭据
- ✅ 测试服务可用性
- ✅ 输出 Claude Code 配置说明

### 2. 配置 Claude Code

编辑 `~/.claudecode/config`，添加：

```json
{
  "mcpServers": {
    "automd-wechat": {
      "command": "python3",
      "args": [
        "/home/ccp/mcp-servers/automd-wechat/server.py",
        "--stdio"
      ],
      "env": {}
    }
  }
}
```

### 3. 重启 Claude Code

```bash
# 如果是 PM2 管理的服务
pm2 restart claude-code-ui

# 或手动重启你的 Claude Code 实例
```

### 4. 开始使用

在 Claude Code 对话中：

```
使用 automd-wechat 发布这篇文章到微信公众号：

# 我的第一篇文章

这是文章内容...
```

## 🔐 凭据管理

### 每个用户独立配置

每个用户需要配置自己的微信公众号凭据：

```bash
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh
```

凭据保存在 `~/.automd-credentials.json`（权限 600，仅本人可读）

### 多公众号支持

不同用户可以配置不同的微信公众号：
- 用户 A 配置公众号 X → 文章发到公众号 X
- 用户 B 配置公众号 Y → 文章发到公众号 Y

### 共享公众号（可选）

如果团队共享一个公众号，管理员可以为所有用户配置相同的凭据：

```bash
# 方法 1: 让每个用户自己配置（推荐）
# 每个用户运行: bash setup-credentials.sh

# 方法 2: 管理员统一配置
for user in user1 user2 user3; do
  cat > /home/$user/.automd-credentials.json <<EOF
{
  "appid": "wxdcac218fd0dd1f42",
  "app_secret": "5a6ebb9e9111ced774c219e0806066e4",
  "gh_id": "gh_9673cf6fee20"
}
EOF
  chown $user:$user /home/$user/.automd-credentials.json
  chmod 600 /home/$user/.automd-credentials.json
done
```

## 🔧 核心功能

### 支持的 MCP 方法

1. **publish_markdown** - 发布 Markdown 内容
   - 参数: content（必需）、title（可选）、cover_image（可选）
   - 自动提取标题、智能选择封面

2. **publish_file** - 发布 Markdown 文件
   - 参数: file_path（必需）、title（可选）、cover_image（可选）
   - 读取本地文件并发布

3. **list_methods** - 列出所有方法
   - 查询 API 文档

### 智能特性

- ✅ **自动标题提取**: 从 Markdown 第一个 H1 标题提取
- ✅ **智能封面选择**: 根据标题或内容关键词自动选择封面
- ✅ **格式转换**: Markdown → 微信公众号 HTML 格式
- ✅ **错误处理**: 完善的错误提示和重试机制

## 📚 技术架构

```
用户请求
   ↓
Claude Code (MCP Client)
   ↓
automd-wechat MCP Server (/home/ccp/mcp-servers/automd-wechat/)
   ↓
automd 核心模块 (/home/wexin/automd/)
   ↓
微信公众号 API
   ↓
微信公众号草稿箱
```

### 设计亮点

1. **只读引用源代码**: MCP 服务器不修改 `/home/wexin/automd`，只读取使用
2. **凭据隔离**: 每个用户独立存储凭据，互不干扰
3. **权限保护**: 凭据文件自动设置 600 权限
4. **标准协议**: 遵循 MCP (Model Context Protocol) 标准
5. **易于扩展**: 可以轻松添加新的方法和功能

## 🧪 测试

### 测试脚本

```bash
cd /home/ccp/mcp-servers/automd-wechat
python3 test-mcp.py
```

### 手动测试

```bash
echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "list_methods"
}' | python3 /home/ccp/mcp-servers/automd-wechat/server.py --stdio
```

## 📖 文档

- **完整文档**: `/home/ccp/mcp-servers/automd-wechat/README.md`
- **使用示例**: `/home/ccp/mcp-servers/automd-wechat/EXAMPLES.md`
- **原始项目**: `/home/wexin/automd/README.md`

## 🔍 故障排查

### 常见问题

1. **凭据未配置**
   ```bash
   bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh
   ```

2. **依赖未安装**
   ```bash
   pip3 install -r /home/wexin/automd/requirements.txt
   ```

3. **权限问题**
   ```bash
   chmod 600 ~/.automd-credentials.json
   ```

### 健康检查

```bash
# 检查凭据文件
cat ~/.automd-credentials.json

# 测试模块导入
python3 -c "import sys; sys.path.insert(0, '/home/wexin/automd'); from src.config.config_manager import ConfigManager; print('OK')"

# 完整测试
cd /home/ccp/mcp-servers/automd-wechat && python3 test-mcp.py
```

## 🎯 下一步

1. **通知其他用户**: 告知团队成员新服务已上线
2. **编写团队文档**: 根据团队实际情况补充使用规范
3. **监控使用情况**: 观察服务稳定性，收集反馈
4. **扩展功能**: 根据需求添加新的 MCP 方法

## 📝 更新日志

- **2024-12-11**: 初始版本
  - ✅ 创建 MCP 服务器
  - ✅ 凭据管理脚本
  - ✅ 测试工具
  - ✅ 完整文档

## 📧 技术支持

- 查看文档: `/home/ccp/mcp-servers/automd-wechat/README.md`
- 运行测试: `python3 /home/ccp/mcp-servers/automd-wechat/test-mcp.py`
- 查看日志: `~/.automd-credentials.json` 同目录下的日志文件

---

**祝使用愉快！如有问题请参考文档或运行测试工具进行诊断。**
