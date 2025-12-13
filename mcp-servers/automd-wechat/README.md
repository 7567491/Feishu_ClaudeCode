# AutoMD WeChat MCP Server

将 Markdown 文件发布到微信公众号草稿箱的 MCP 服务。

## 功能特性

- ✅ **Markdown 转微信**: 自动将 Markdown 转换为微信公众号格式
- ✅ **智能封面选择**: 根据标题或内容智能选择封面图片
- ✅ **多用户支持**: 每个用户独立配置凭据
- ✅ **MCP 标准**: 遵循 Model Context Protocol 标准
- ✅ **安全隔离**: 凭据文件权限保护（600）

## 快速开始

### 1. 配置凭据

每个用户首次使用前需要配置微信公众号凭据：

```bash
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh
```

按提示输入：
- `WECHAT_APPID`: 微信公众号 AppID
- `WECHAT_APP_SECRET`: 微信公众号 AppSecret
- `WECHAT_GH_ID`: 微信公众号原始 ID

凭据将保存到 `~/.automd-credentials.json`（仅当前用户可访问）

### 2. 在 Claude Code 中使用

在 `~/.claudecode/config` 中添加 MCP 服务器配置：

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

重启 Claude Code 后即可使用。

### 3. 使用示例

在 Claude Code 对话中：

```
请使用 automd-wechat MCP 服务将这个 Markdown 文件发布到微信公众号：
[粘贴 Markdown 内容]
```

或者：

```
使用 automd-wechat 发布 /path/to/article.md 到微信公众号
```

## MCP 方法说明

### publish_markdown

将 Markdown 内容发布到微信公众号草稿箱。

**参数：**
- `content` (必需): Markdown 内容字符串
- `title` (可选): 文章标题，不提供则自动从内容提取
- `cover_image` (可选): 封面图片路径，不提供则智能选择

**返回：**
```json
{
  "success": true,
  "draft_id": "xxxxx",
  "message": "上传成功"
}
```

### publish_file

发布本地 Markdown 文件到微信公众号。

**参数：**
- `file_path` (必需): Markdown 文件路径
- `title` (可选): 文章标题
- `cover_image` (可选): 封面图片路径

**返回：** 同 `publish_markdown`

### list_methods

列出所有可用的方法和参数说明。

## 独立命令行使用

也可以不通过 MCP，直接使用原始 automd 工具：

```bash
cd /home/wexin/automd
python3 main.py article.md --title "文章标题" --cover "/path/to/cover.jpg"
```

## 凭据管理

### 查看当前凭据

```bash
cat ~/.automd-credentials.json
```

### 重新配置凭据

```bash
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh
```

### 删除凭据

```bash
rm ~/.automd-credentials.json
```

### 为其他用户配置

如果管理员需要为其他用户配置凭据：

```bash
# 方法 1: 使用用户自己的账号配置
su - username
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh

# 方法 2: 直接创建凭据文件（需要 root 权限）
cat > /home/username/.automd-credentials.json <<EOF
{
  "appid": "wxdcac218fd0dd1f42",
  "app_secret": "5a6ebb9e9111ced774c219e0806066e4",
  "gh_id": "gh_9673cf6fee20"
}
EOF
chown username:username /home/username/.automd-credentials.json
chmod 600 /home/username/.automd-credentials.json
```

## 支持的 Markdown 语法

- ✅ 标题 (H1-H6)
- ✅ 段落文本
- ✅ **粗体** 和 *斜体*
- ✅ `内联代码`
- ✅ 代码块
- ✅ 有序/无序列表
- ✅ 表格
- ✅ [链接](https://example.com)

## 技术架构

```
用户 → Claude Code → MCP Client → automd-wechat MCP Server
                                      ↓
                                  automd 核心模块
                                      ↓
                                  微信公众号 API
```

### 目录结构

```
/home/ccp/mcp-servers/automd-wechat/
├── server.py                 # MCP 服务器实现
├── setup-credentials.sh      # 凭据配置脚本
└── README.md                 # 本文档

/home/wexin/automd/          # automd 核心代码（只读引用）
├── src/                      # 核心模块
├── main.py                   # 原始命令行工具
└── requirements.txt          # Python 依赖
```

## 故障排查

### 凭据未找到

```
错误: 缺少必需的环境变量: WECHAT_APPID
```

**解决：** 运行凭据配置脚本
```bash
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh
```

### 模块导入错误

```
ModuleNotFoundError: No module named 'xxx'
```

**解决：** 安装 automd 依赖
```bash
cd /home/wexin/automd
pip3 install -r requirements.txt
```

### 微信 API 调用失败

```
错误: 上传失败: invalid appid
```

**解决：** 检查凭据是否正确
```bash
cat ~/.automd-credentials.json
# 确认 appid、app_secret、gh_id 是否正确
```

## 安全注意事项

1. **凭据隔离**: 每个用户的凭据独立存储，互不干扰
2. **文件权限**: 凭据文件自动设置为 600 权限（仅所有者可读写）
3. **不要共享**: 不要将凭据文件复制给其他用户
4. **定期更换**: 建议定期更换微信公众号的 AppSecret

## 许可证

MIT License - 基于 automd 项目

## 技术支持

- automd 项目: `/home/wexin/automd/README.md`
- MCP 规范: https://spec.modelcontextprotocol.io/
