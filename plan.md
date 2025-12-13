# 开发计划

## 第一阶段：项目初始化
- [x] 创建项目目录结构
- [x] 初始化package.json
- [x] 安装依赖包（express, axios, @anthropic-ai/sdk等）
- [x] 创建./paper目录用于存储PDF

## 第二阶段：前端开发
- [x] 创建index.html主页面结构
- [x] 实现搜索框和按钮组件
- [x] 实现进度条组件（综述生成进度）
- [x] 实现文献综述展示区域（可滚动）
- [x] 实现论文列表表格
- [x] 实现单篇下载按钮
- [x] 实现全部下载按钮
- [x] 实现单篇下载进度条
- [x] 添加CSS样式美化
- [x] 实现前端JavaScript交互逻辑

## 第三阶段：后端核心服务
- [ ] 创建server.js入口文件
- [ ] 配置Express服务器（端口25080）
- [ ] 创建ClaudeService模块
- [ ] 实现/api/generate-review接口
- [ ] 优化Claude提示词模板
- [ ] 实现JSON响应解析和验证
- [ ] 添加API错误处理和重试机制

## 第四阶段：论文下载功能
- [ ] 创建DownloadService模块
- [ ] 实现本地PDF检查功能
- [ ] 实现Google Scholar爬取（使用axios）
- [ ] 实现arXiv爬取
- [ ] 实现Sci-Hub爬取（备用方案）
- [ ] 实现/api/download-paper接口
- [ ] 实现/api/download-all接口（SSE流式响应）
- [ ] 实现PDF保存到./paper目录
- [ ] 实现PDF复制到/mnt/lit/paper
- [ ] 生成网盘下载链接

## 第五阶段：测试与优化
- [ ] 编写ClaudeService单元测试
- [ ] 编写DownloadService单元测试
- [ ] 测试综述生成功能
- [ ] 测试单篇论文下载
- [ ] 测试批量下载功能
- [ ] 测试并发下载限制
- [ ] 测试网盘链接生成
- [ ] 测试错误处理机制
- [ ] 性能优化和代码重构

## 第六阶段：部署与文档
- [ ] 配置Nginx反向代理（如需修改）
- [ ] 测试域名访问（lit.linapp.fun）
- [ ] 编写README.md用户指南
- [ ] 添加代码注释
- [ ] 最终功能验收测试

## 开发原则
- TDD开发：先写测试再写实现
- 增量开发：每完成一个任务立即测试
- 简洁优先：使用最简单的实现方式
- 及时更新：完成一个任务立即在plan.md打勾
