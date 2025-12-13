# 传送命令使用说明

## 功能概述

新增 **"传送"** 命令，用于快速将工作目录中的文件发送到当前飞书对话。

## 使用方法

### 基础语法

```
传送 <文件名>
```

### 支持的文件格式

- 文档：`.md` `.pdf` `.doc` `.docx` `.xls` `.xlsx` `.txt`
- 压缩包：`.zip` `.rar`
- 图片：`.jpg` `.png` `.jpeg` `.gif` `.bmp` `.svg`

### 使用示例

1. **传送图片文件**
   ```
   传送 PNI_Architecture.png
   ```

2. **传送 PDF 文件**
   ```
   传送 报告.pdf
   ```

3. **传送带路径的文件**
   ```
   传送 subdir/document.docx
   ```

4. **传送 Markdown 文件**
   ```
   传送 README.md
   ```

## 工作原理

1. **命令解析**：系统识别以"传送"开头的消息
2. **文件查找**：在当前会话的工作目录中查找指定文件
   - 支持当前目录查找
   - 支持子目录查找（一层深度）
   - 支持相对路径和绝对路径
   - 自动处理大小写不敏感匹配
3. **文件上传**：找到文件后上传到飞书
4. **消息发送**：将文件发送到当前对话

## 文件查找逻辑

系统会按以下顺序查找文件：

1. 工作目录直接路径：`/home/ccp/<文件名>`
2. 相对路径：`./subdir/<文件名>`
3. 父目录：`../`
4. 子目录（一级深度）

## 防重复机制

- 同一文件在 10 秒内不会重复发送到同一对话
- 避免误触发导致的重复发送

## 测试用例

使用以下命令测试功能：

```bash
# 运行测试脚本
node test-transfer-command.js

# 测试传送 PNG 文件
# 在飞书对话中发送：传送 PNI_Architecture.png
```

## 文件位置

- **测试文件**：`/home/ccp/PNI_Architecture.png` (525KB, 4770x3570 PNG)
- **命令处理器**：`server/lib/feishu-file-handler.js`
- **主服务**：`server/feishu-ws.js`

## 错误处理

系统会在以下情况返回错误：

- **文件未找到**：`❌ 传送失败: 文件未找到: <文件名>`
- **上传失败**：`❌ 传送失败: <错误详情>`

## 与"发送"命令的区别

| 特性 | 传送命令 | 发送命令 |
|------|---------|---------|
| 触发词 | `传送` | `发送` |
| 使用场景 | 快速传输文件 | 正式发送文件 |
| 功能 | 完全相同 | 完全相同 |

两个命令底层调用相同的 `handleFileSend` 函数，只是提供不同的用户体验。

## 日志记录

所有传送操作都会记录到数据库：

```sql
SELECT * FROM feishu_message_log
WHERE content LIKE 'transfer:%'
ORDER BY created_at DESC LIMIT 10;
```

## 技术实现

### 代码位置

- **解析器**：`FeishuFileHandler.parseTransferCommand()` (server/lib/feishu-file-handler.js:60-85)
- **处理器**：`FeishuService.handleMessage()` (server/feishu-ws.js:398-421)
- **文件发送**：`FeishuFileHandler.handleFileSend()` (server/lib/feishu-file-handler.js:210-239)

### 关键流程

```javascript
// 1. 解析命令
const transferCommand = FeishuFileHandler.parseTransferCommand(userText);

// 2. 查找文件
const filePath = FeishuFileHandler.findFile(projectPath, fileName);

// 3. 发送文件
await client.sendFile(chatId, filePath);
```

## 注意事项

1. 文件大小限制：100MB（飞书 API 限制）
2. 工作目录固定：由飞书会话配置决定，不能通过 `cd` 修改
3. 查找深度：子目录只搜索一层，避免性能问题
4. 权限要求：需要飞书应用具有文件上传权限

## 更新日志

- **2025-12-09**：新增"传送"命令支持
  - 支持常见文件格式
  - 智能文件查找
  - 防重复发送机制
  - 完整的错误处理

## 相关命令

- `发送 <文件名>` - 发送文件（功能相同）
- `转化 <文件名.md>` - 将 Markdown 转为飞书文档
- `/clear` - 清空会话上下文
- `paper <关键词>` - 搜索学术文献

---

**需要帮助？** 在飞书对话中直接向机器人提问。
