# AutoMD MCP 服务使用示例

## 示例 1: 发布简单的 Markdown 内容

在 Claude Code 对话中：

```
使用 automd-wechat 发布以下内容到微信公众号：

# AI 编程时代来临

随着 GPT-4 和 Claude 等大语言模型的出现，编程方式正在发生革命性变化。

## 主要变化

- **自然语言编程**: 用人类语言描述需求
- **智能代码生成**: AI 自动生成高质量代码
- **实时代码审查**: AI 协助代码质量提升

## 结论

AI 编程不是取代程序员，而是让程序员更加高效。
```

## 示例 2: 发布本地文件

```
请使用 automd-wechat 发布 /home/ccp/articles/latest-post.md 到微信公众号
```

## 示例 3: 指定标题和封面

```
使用 automd-wechat 发布文件，要求：
- 文件: /home/ccp/blog/tech-trends.md
- 标题: "2024 技术趋势分析"
- 封面: /home/ccp/images/tech-cover.jpg
```

## 示例 4: 批量发布多篇文章

```
使用 automd-wechat 依次发布以下文章：
1. /home/ccp/posts/post1.md
2. /home/ccp/posts/post2.md
3. /home/ccp/posts/post3.md
```

## MCP 原始调用示例

如果你想通过其他方式调用 MCP 服务，可以使用 JSON-RPC 2.0 格式：

### 发布 Markdown 内容

```bash
echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "publish_markdown",
  "params": {
    "content": "# 测试文章\n\n这是内容。",
    "title": "我的测试文章"
  }
}' | python3 /home/ccp/mcp-servers/automd-wechat/server.py --stdio
```

### 发布本地文件

```bash
echo '{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "publish_file",
  "params": {
    "file_path": "/path/to/article.md",
    "title": "文章标题"
  }
}' | python3 /home/ccp/mcp-servers/automd-wechat/server.py --stdio
```

### 查询可用方法

```bash
echo '{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "list_methods"
}' | python3 /home/ccp/mcp-servers/automd-wechat/server.py --stdio
```

## 响应格式

### 成功响应

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "success": true,
    "draft_id": "2000000123",
    "message": "上传成功"
  }
}
```

### 错误响应

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "success": false,
    "message": "上传失败: invalid appid"
  }
}
```

## 常见场景

### 场景 1: 技术博客发布

```
我写了一篇关于 Docker 容器化的博客，保存在 ~/blog/docker-intro.md
请帮我发布到微信公众号，标题改为"Docker 容器化实战指南"
```

### 场景 2: 周报自动发布

```
每周五，我需要将 ~/reports/weekly-report.md 发布到微信公众号
请使用 automd-wechat 发布本周的周报
```

### 场景 3: 文档转公众号文章

```
我有一个技术文档 ~/docs/api-guide.md，想转成公众号文章
但是需要添加一个自定义封面: ~/images/api-cover.jpg
请帮我发布
```

## 高级用法

### 在脚本中调用

创建一个发布脚本 `publish.sh`:

```bash
#!/bin/bash
# 自动发布脚本

ARTICLE=$1

if [ -z "$ARTICLE" ]; then
    echo "用法: ./publish.sh <markdown文件>"
    exit 1
fi

echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "publish_file",
  "params": {
    "file_path": "'$ARTICLE'"
  }
}' | python3 /home/ccp/mcp-servers/automd-wechat/server.py --stdio
```

使用：
```bash
chmod +x publish.sh
./publish.sh ~/articles/my-post.md
```

### 与其他工具集成

结合 `paper` 命令生成文献综述并发布：

```
1. 先用 paper 命令生成文献综述
2. 然后用 automd-wechat 发布综述到微信公众号
```

## 故障排查

### 问题 1: 凭据未配置

**症状**: 提示 "缺少必需的环境变量: WECHAT_APPID"

**解决**:
```bash
bash /home/ccp/mcp-servers/automd-wechat/setup-credentials.sh
```

### 问题 2: 模块导入失败

**症状**: "ModuleNotFoundError: No module named 'markdown'"

**解决**:
```bash
pip3 install -r /home/wexin/automd/requirements.txt
```

### 问题 3: 微信 API 调用失败

**症状**: "上传失败: invalid appid"

**解决**: 检查凭据是否正确
```bash
cat ~/.automd-credentials.json
# 确认 appid、app_secret、gh_id 是否正确
```

## 更多帮助

- 完整文档: `/home/ccp/mcp-servers/automd-wechat/README.md`
- automd 项目: `/home/wexin/automd/README.md`
- 测试工具: `python3 /home/ccp/mcp-servers/automd-wechat/test-mcp.py`
