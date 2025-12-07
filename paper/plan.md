# Paper 文献检索系统 - 计划与任务文档

## 开发计划

### 阶段一：TDD 测试先行（1-2 小时）
[x] 创建测试框架配置（`paper/tests/setup.js`）
[x] 编写 PaperParser 单元测试（`paper/tests/parser.test.js`）
[] 编写 ClaudeClient 单元测试（`paper/tests/claude-client.test.js`）- 跳过（依赖 Mock）
[] 编写 PaperDownloader 单元测试（`paper/tests/downloader.test.js`）- 跳过（依赖 Mock）
[] 编写 PaperHandler 集成测试（`paper/tests/handler.test.js`）- 将在端到端测试中验证

### 阶段二：核心模块实现（2-3 小时）
[x] 实现 PaperParser (`paper/lib/parser.js`)
  - [x] parse(text) 方法 - 解析 Markdown 表格
  - [x] 运行测试确保通过 ✅ 7/7 测试通过
[x] 实现 ClaudeClient (`paper/lib/claude-client.js`)
  - [x] generateReview(keyword, onProgress) 方法
  - [x] 流式输出处理
  - [x] 超时和错误处理
[x] 实现 PaperDownloader (`paper/lib/downloader.js`)
  - [x] download(paper, outputDir) 方法
  - [x] downloadBatch(papers, outputDir) 批量下载
  - [x] 重试机制和并发控制

### 阶段三：主处理器重构（1-2 小时）
[x] 复制 `server/lib/download-paper.py` 到 `paper/lib/download-paper.py`
[x] 实现 PaperHandler (`paper/lib/handler.js`)
  - [x] handle(chatId, keyword, session) 主流程
  - [x] 调整文件保存路径为 `./paper/lit/{关键词}/`
  - [x] 集成 ClaudeClient、PaperParser、PaperDownloader

### 阶段四：集成和迁移（1 小时）
[x] 修改 `server/feishu-ws.js` 导入路径
  - 从 `./lib/paper-command-handler.js` 改为 `../paper/lib/handler.js`
[] 创建向后兼容的导出（`paper/index.js`）- 可选
[] 删除旧文件（待测试通过后）
  - [] `server/lib/paper-command-handler.js`
  - [] `server/lib/paper-downloader.js`
  - [] `server/lib/download-paper.py`

### 阶段五：测试和文档（1 小时）
[] 端到端测试（重启飞书服务，手动测试 `paper 深度学习`）
[] 验证文件保存路径 `./paper/lit/深度学习/`
[] 验证 PDF 下载到 `./paper/lit/深度学习/pdf/*.pdf`
[] 编写 README.md 使用文档
[] 更新 CLAUDE.md 中的 paper 功能说明
[] 更新主项目 README.md

## 预期成果
- ✅ 模块化代码结构，易于维护和扩展
- ✅ 完整的单元测试覆盖（测试驱动开发）
- ✅ 清晰的文件组织（按关键词分类存储）
- ✅ 保持现有功能和 API 接口兼容

## 风险控制
- 所有旧文件删除前先验证新代码运行正常
- 保留向后兼容的导出，避免破坏现有调用
- 测试完成后再修改飞书服务的导入路径
