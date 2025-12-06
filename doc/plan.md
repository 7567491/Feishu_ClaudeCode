# 开发计划：Paper 文献检索下载系统

## 总体策略
采用 TDD（测试驱动开发）流程：先写测试 → 实现功能 → 重构优化

## 任务清单

### 阶段 1：测试框架搭建
- [x] 创建测试目录结构 `test/paper/`
- [x] 编写表格解析测试用例（Markdown 格式）
- [x] 编写表格解析测试用例（纯文本格式）
- [x] 编写空输入和异常输入测试

### 阶段 2：核心模块开发
- [x] 创建 `server/lib/paper-command-handler.js` 骨架
- [x] 实现 `parseTable()` 方法（通过解析测试）
- [x] 创建 `server/lib/paper-downloader.js` 骨架
- [x] 实现 `callPythonDownloader()` 方法
- [x] 编写下载器单元测试（模拟 Python 调用）
- [x] 实现 `downloadPapers()` 批量下载逻辑

### 阶段 3：Claude 集成
- [x] 实现 `callClaudeForReview()` 调用 Claude API
- [x] 处理 Claude 返回值和错误
- [x] 编写 Claude 集成测试（使用 mock 数据）
- [x] 添加超时和重试机制

### 阶段 4：飞书消息处理扩展
- [x] 在 `feishu-ws.js` 添加 paper 指令检测
- [x] 集成 PaperCommandHandler 调用
- [x] 添加进度消息反馈（"正在生成..."）
- [x] 实现 PDF 文件发送逻辑
- [x] 处理发送失败和重试

### 阶段 5：Python 脚本适配
- [x] 检查 `/home/paper/pdf_manager.py` CLI 接口
- [x] 如需要，编写 wrapper 脚本适配参数格式
- [x] 测试权限（sudo -u paper 调用）
- [x] 验证 PDF 保存到正确目录

### 阶段 6：端到端测试
- [x] 编写完整流程测试脚本 `test/test-paper-e2e.js`
- [x] 测试：正常流程（3 篇论文）
- [x] 测试：部分失败场景（1 篇下载失败）
- [x] 测试：全部失败场景
- [x] 测试：网络超时场景

### 阶段 7：错误处理和日志
- [x] 添加详细日志记录
- [x] 实现友好错误提示
- [x] 添加下载统计（成功/失败数量）
- [x] 测试所有错误分支

### 阶段 8：性能优化
- [x] 实现并发下载（最多 3 个）
- [x] 添加下载进度实时反馈
- [x] 优化内存使用（大文件处理）
- [x] 压力测试（20 篇论文同时下载）

### 阶段 9：文档和部署
- [x] 更新 README 添加 paper 指令说明
- [x] 编写使用示例和常见问题
- [x] 提交代码到 Git 仓库
- [ ] 重启 feishu 服务 `pm2 restart feishu`
- [ ] 在真实飞书群测试功能

## 估计工作量
- 测试编写：1.5 小时
- 核心开发：2 小时
- 集成调试：1 小时
- 文档整理：0.5 小时

**总计**：约 5 小时

## 风险和依赖
1. `/home/paper` 权限问题 → 使用 `sudo -u paper` 解决
2. Python 脚本 API 不稳定 → 编写适配层
3. Claude API 限流 → 添加重试和降级提示
4. 飞书文件上传大小限制 → 检查单文件不超过 20MB

## 验收标准
✅ 所有单元测试通过
✅ 端到端测试成功下载并发送 3 篇 PDF
✅ 在飞书真实环境测试通过
✅ 代码审查通过，无安全漏洞
✅ README 文档完整清晰
