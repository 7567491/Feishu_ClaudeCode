# Paper 文献检索系统 - 详细设计文档

## 系统架构

### 模块划分
```
paper/
├── lib/                    # 核心业务逻辑
│   ├── handler.js         # 主处理器（原 paper-command-handler.js）
│   ├── downloader.js      # PDF 下载器（原 paper-downloader.js）
│   ├── parser.js          # 论文表格解析器（新增）
│   ├── claude-client.js   # Claude 子进程封装（新增）
│   └── download-paper.py  # Python 下载脚本
├── tests/                 # 单元测试
│   ├── handler.test.js
│   ├── downloader.test.js
│   └── parser.test.js
├── lit/                   # 文献库（按关键词分类）
│   └── {关键词}/
│       ├── {关键词}_文献综述.md
│       └── pdf/*.pdf
├── need.md               # 需求文档
├── design.md            # 设计文档
├── plan.md              # 计划文档
└── README.md            # 使用说明

server/
└── feishu-ws.js         # 调用入口（修改导入路径）
```

## 核心类设计

### 1. PaperHandler (主处理器)
**职责**：协调整个文献检索流程

**核心方法**：
- `handle(chatId, keyword, session)` - 主入口
- `generateReview(keyword)` - 生成文献综述（调用 ClaudeClient）
- `saveReview(keyword, content)` - 保存综述到 `./paper/lit/{关键词}/`
- `parsePapers(reviewText)` - 解析论文列表（调用 PaperParser）
- `downloadPapers(papers, keyword)` - 批量下载 PDF（调用 PaperDownloader）

**路径规则**：
- 基础目录：`./paper/lit/{sanitized_keyword}/`
- 综述文件：`{sanitized_keyword}_文献综述.md`
- PDF 目录：`pdf/`

### 2. ClaudeClient (Claude 子进程封装)
**职责**：独立管理 Claude CLI 调用，支持流式输出

**核心方法**：
- `generateReview(keyword, onProgress)` - 调用 Claude 生成综述
  - 参数：`keyword` (关键词), `onProgress(chunk)` (实时回调)
  - 返回：完整综述文本
  - 超时：120 秒
  - 格式：`--output-format stream-json`

**提示词模板**：
```
使用高引用的真实文献写一段文献综述
{keyword}
最后用表格形式列出论文的作者、发表年份、论文名称、引用次数、发表期刊以及论文名中文翻译
```

### 3. PaperParser (论文表格解析器)
**职责**：从 Markdown 表格中提取论文信息

**核心方法**：
- `parse(text)` - 解析表格
  - 返回格式：`[{author, year, title, citations, journal, titleCn}, ...]`
  - 跳过表头和分隔线
  - 支持中英文混合表格

**解析规则**：
- 表格格式：`| 作者 | 年份 | 标题 | 引用 | 期刊 | 中文标题 |`
- 最少 6 列才视为有效数据

### 4. PaperDownloader (PDF 下载器)
**职责**：从多个数据源下载 PDF

**核心方法**：
- `download(paper, outputDir)` - 下载单篇论文
  - 超时：60 秒
  - 重试：最多 2 次
  - 返回：`{success, filePath, error}`
- `downloadBatch(papers, outputDir)` - 批量并发下载
  - 并发数：3

**数据源策略**（优先级从高到低）：
1. arXiv API（开放访问）
2. Google Scholar（受限）
3. Sci-Hub（保留接口，默认禁用）

**文件命名**：
- 清理非法字符：`[<>:"/\\|?*]`
- 长度限制：200 字符
- 格式：`{sanitized_title}.pdf`

## 数据流设计

```
用户输入 "paper 深度学习"
    ↓
[FeishuService] 检测 paper 指令
    ↓
[PaperHandler.handle()]
    ├─→ [ClaudeClient.generateReview()]
    │       └─→ spawn('claude', ['-p', '--output-format', 'stream-json', ...])
    │           └─→ 实时输出 → 飞书消息
    ├─→ 保存综述到 ./paper/lit/深度学习/深度学习_文献综述.md
    ├─→ [PaperParser.parse()] 提取论文列表
    └─→ [PaperDownloader.downloadBatch()]
            └─→ 保存到 ./paper/lit/深度学习/pdf/*.pdf
```

## 测试策略

### 单元测试（TDD）
1. **PaperParser 测试**
   - 测试正常表格解析
   - 测试空输入
   - 测试不完整表格
   - 测试中英文混合

2. **ClaudeClient 测试**（Mock）
   - 测试正常流式输出
   - 测试超时处理
   - 测试进程异常退出

3. **PaperDownloader 测试**（Mock HTTP）
   - 测试成功下载
   - 测试超时重试
   - 测试并发控制

## 兼容性保证
- 保持 `server/feishu-ws.js` 的调用接口不变
- 只修改导入路径：`import { PaperHandler } from '../paper/lib/handler.js'`
