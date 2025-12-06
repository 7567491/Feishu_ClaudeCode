# 详细设计文档：Paper 文献检索下载系统

## 1. 系统架构

### 1.1 整体流程
```
用户输入 "paper {关键词}"
    ↓
feishu-ws.js 拦截指令
    ↓
调用 PaperCommandHandler.handle()
    ↓
调用 Claude 生成文献综述
    ↓
解析 Claude 返回的论文表格
    ↓
调用 PaperDownloader 下载 PDF
    ↓
通过 FeishuFileHandler 发送 PDF
```

### 1.2 模块设计

#### 模块 1: PaperCommandHandler（server/lib/paper-command-handler.js）
**职责**：处理 paper 指令，协调整个流程

**关键方法**：
- `handle(chatId, keyword, session)` - 主入口
- `callClaudeForReview(keyword)` - 调用 Claude 生成综述
- `parseTable(text)` - 解析论文表格
- `downloadAndSendPapers(chatId, papers, pdfDir)` - 下载并发送

**输入**：
- chatId: 飞书会话 ID
- keyword: 用户输入的关键词
- session: 当前会话对象

**输出**：
- 发送文献综述消息
- 发送 PDF 文件

#### 模块 2: PaperDownloader（server/lib/paper-downloader.js）
**职责**：调用 /home/paper 的 Python 脚本下载 PDF

**关键方法**：
- `downloadPapers(papers, outputDir)` - 批量下载
- `callPythonDownloader(title, author, year, outputPath)` - 调用 Python 脚本
- `verifyPdfExists(filePath)` - 验证下载成功

**技术实现**：
- 使用 `child_process.spawn` 调用 Python
- 命令：`sudo -u paper python3 /home/paper/pdf_manager.py download --title "{title}" --output "{path}"`
- 超时控制：60 秒

#### 模块 3: 飞书消息处理扩展（server/feishu-ws.js）
**修改点**：在 `handleTextMessage` 方法中添加 paper 指令检测

```javascript
// 在第 240 行左右，/clear 命令检测之后插入
if (trimmedText.toLowerCase().startsWith('paper ')) {
  const keyword = trimmedText.substring(6).trim();
  if (!keyword) {
    await this.client.sendTextMessage(chatId, '❌ 请提供关键词，例如：paper 深度学习');
    return;
  }

  const { PaperCommandHandler } = await import('./lib/paper-command-handler.js');
  const handler = new PaperCommandHandler(this.client);
  await handler.handle(chatId, keyword, session);
  return;
}
```

## 2. 数据结构

### 2.1 论文对象
```javascript
{
  author: string,          // 作者
  year: string,            // 发表年份
  title: string,           // 论文标题
  citations: number,       // 引用次数
  journal: string,         // 发表期刊
  titleCn: string          // 中文翻译
}
```

### 2.2 下载结果
```javascript
{
  success: boolean,        // 是否成功
  filePath: string,        // 文件路径
  error: string            // 错误信息（如果失败）
}
```

## 3. 关键算法

### 3.1 表格解析算法
Claude 返回的表格可能是 Markdown 或纯文本格式：

```javascript
function parseTable(text) {
  const lines = text.split('\n');
  const papers = [];

  for (const line of lines) {
    // 跳过表头和分隔线
    if (line.includes('作者') || line.match(/^[\s\-|]+$/)) continue;

    // Markdown 表格：| 作者 | 年份 | 标题 | ...
    if (line.trim().startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 6) {
        papers.push({
          author: cells[0],
          year: cells[1],
          title: cells[2],
          citations: parseInt(cells[3]) || 0,
          journal: cells[4],
          titleCn: cells[5]
        });
      }
    }
  }

  return papers;
}
```

### 3.2 下载重试机制
- 最多重试 3 次
- 每次失败后等待 2 秒
- 超时时间：60 秒

## 4. 错误处理

### 4.1 场景覆盖
- Claude 调用失败：返回错误提示
- 表格解析失败：提示"无法解析论文列表"
- Python 脚本调用失败：记录日志，跳过该论文
- PDF 下载失败：在飞书消息中标注"下载失败"
- 文件发送失败：重试 1 次

### 4.2 日志记录
所有操作记录到 `console.log` 和飞书消息日志：
- `[PaperHandler] 开始处理 paper 指令: {keyword}`
- `[PaperDownloader] 下载论文: {title}`
- `[PaperDownloader] 下载成功/失败: {filePath}`

## 5. 性能优化

### 5.1 并发控制
- 使用 Promise.allSettled 并发下载（最多 3 个）
- 避免阻塞飞书消息处理主线程

### 5.2 进度反馈
```
📚 正在生成文献综述...
✅ 找到 8 篇论文，开始下载...
📥 下载进度：3/8
✅ 已下载 6 篇，失败 2 篇
```

## 6. 测试策略

### 6.1 单元测试
- `parseTable()` 解析各种表格格式
- `downloadPapers()` 模拟 Python 脚本返回

### 6.2 集成测试
- 端到端测试：从飞书输入到接收 PDF
- 异常测试：网络超时、Python 脚本不存在

### 6.3 测试文件
- `test/test-paper-handler.js` - 主流程测试
- `test/test-paper-downloader.js` - 下载器测试
