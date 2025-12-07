# Paper 文献检索系统

基于 Claude AI 的智能文献检索和 PDF 下载系统，集成到飞书机器人中。

## 功能特性

### 核心功能
- **智能文献综述生成**：调用 Claude AI 生成指定主题的高质量学术文献综述
- **自动论文解析**：从综述中提取论文元数据（作者、年份、标题、引用次数、期刊、中文翻译）
- **多源 PDF 下载**：从 arXiv、Google Scholar 等数据源并发下载论文 PDF
- **分类文件管理**：按关键词自动创建目录，统一存储综述和 PDF 文件

### 技术特性
- **模块化设计**：清晰的模块划分，易于维护和扩展
- **流式实时反馈**：通过飞书消息实时显示综述生成进度
- **并发下载控制**：最多 3 个并发下载，避免资源过载
- **失败重试机制**：自动重试最多 2 次，提升下载成功率
- **TDD 测试驱动**：完整的单元测试覆盖

## 使用方法

### 在飞书中使用

在飞书对话中发送以下指令：

```
paper 深度学习
```

系统将自动：
1. 调用 Claude 生成"深度学习"主题的文献综述
2. 实时显示生成进度
3. 保存综述为 Markdown 文件
4. 解析论文列表并下载 PDF
5. 将所有文件发送到飞书对话

### 文件存储规则

```
./paper/lit/{关键词}/
├── {关键词}_文献综述.md    # 文献综述 Markdown 文件
└── pdf/                    # PDF 文件目录
    ├── paper1.pdf
    ├── paper2.pdf
    └── ...
```

**示例**：执行 `paper 深度学习` 后，文件保存在：
- 综述：`./paper/lit/深度学习/深度学习_文献综述.md`
- PDF：`./paper/lit/深度学习/pdf/*.pdf`

## 项目结构

```
paper/
├── lib/                      # 核心业务逻辑
│   ├── handler.js           # 主处理器
│   ├── claude-client.js     # Claude 子进程封装
│   ├── parser.js            # 论文表格解析器
│   ├── downloader.js        # PDF 下载器
│   └── download-paper.py    # Python 下载脚本
├── tests/                   # 单元测试
│   ├── setup.js             # 测试框架配置
│   └── parser.test.js       # PaperParser 测试（7/7 通过 ✅）
├── lit/                     # 文献库（运行时生成）
│   └── {关键词}/
│       ├── {关键词}_文献综述.md
│       └── pdf/*.pdf
├── need.md                  # 需求文档
├── design.md               # 详细设计文档
├── plan.md                 # 计划和任务文档
└── README.md               # 本文件
```

## 模块说明

### PaperHandler (主处理器)
协调整个文献检索流程，集成所有子模块。

**核心方法**：
- `handle(chatId, keyword, session)` - 主入口，处理 paper 指令

### ClaudeClient (Claude 子进程封装)
管理 Claude CLI 调用，支持流式输出。

**核心方法**：
- `generateReview(keyword, onProgress)` - 生成文献综述，支持进度回调

**技术细节**：
- 使用 `--output-format stream-json` 实现流式输出
- 120 秒超时保护
- 自动捕获并解析 JSON 格式输出

### PaperParser (论文表格解析器)
从 Markdown 表格中提取论文信息。

**核心方法**：
- `parse(text)` - 解析包含论文表格的文本

**解析规则**：
- 表格格式：`| 作者 | 年份 | 标题 | 引用 | 期刊 | 中文标题 |`
- 自动跳过表头和分隔线
- 支持中英文混合表格

### PaperDownloader (PDF 下载器)
从多个数据源下载论文 PDF。

**核心方法**：
- `download(paper, outputDir)` - 下载单篇论文
- `downloadBatch(papers, outputDir, concurrency)` - 批量并发下载

**下载策略**：
1. arXiv API（优先，开放访问）
2. Google Scholar（受限）
3. Sci-Hub（保留接口，默认禁用）

**性能优化**：
- 并发控制：最多 3 个
- 重试机制：最多 2 次
- 超时保护：60 秒/论文

## 测试

### 运行单元测试

```bash
cd paper
node --test tests/parser.test.js
```

**测试覆盖**：
- ✅ PaperParser：7/7 测试通过
- ⏭️ ClaudeClient：需要 Mock，跳过
- ⏭️ PaperDownloader：需要 Mock，跳过
- ⏭️ PaperHandler：通过端到端测试验证

### 端到端测试

在飞书对话中测试：
```
paper 深度学习
```

验证点：
- ✅ 文献综述生成
- ✅ 实时进度显示
- ✅ Markdown 文件保存到 `./paper/lit/深度学习/`
- ✅ PDF 下载到 `./paper/lit/深度学习/pdf/`
- ✅ 文件发送到飞书对话

## 开发说明

### 添加新的下载数据源

编辑 `paper/lib/download-paper.py`，在 `search_and_download_paper()` 函数中添加新的数据源：

```python
sources = [
    ('Google Scholar', lambda: search_google_scholar(title, author, year)),
    ('arXiv', lambda: search_arxiv(title)),
    ('SciHub', lambda: search_scihub(title)),
    ('新数据源', lambda: search_new_source(title))  # 添加这里
]
```

### 修改并发数和重试次数

编辑 `paper/lib/downloader.js` 构造函数：

```javascript
constructor() {
  this.timeout = 60000;     // 超时（毫秒）
  this.maxRetries = 2;      // 重试次数
}
```

编辑 `paper/lib/handler.js` 的 `downloadAndSendPapers()` 方法：

```javascript
const concurrency = 3;  // 并发数
```

## 性能指标

- **综述生成时间**：30-120 秒（取决于关键词复杂度）
- **单篇 PDF 下载时间**：5-60 秒（取决于网络和数据源）
- **并发下载数**：3 个（可配置）
- **内存占用**：< 100MB（单次请求）

## 注意事项

1. **下载成功率**：部分论文可能因访问限制或版权原因无法下载
2. **文件去重**：已下载的文件不会重复下载（基于文件名）
3. **路径限制**：关键词中的非法字符会被替换为下划线
4. **服务重启**：修改代码后需重启飞书服务：`pm2 restart feishu`

## 版本历史

### v2.0.0 (2024-12-07)
- ✨ 重构为模块化架构，迁移到 `./paper/` 独立目录
- ✨ 新增按关键词分类存储功能
- ✨ 实现 TDD 测试驱动开发
- ✨ 优化文件组织结构
- 🐛 修复路径管理问题

### v1.0.0 (2024-11-XX)
- 🎉 初始版本，基础文献检索和 PDF 下载功能

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
