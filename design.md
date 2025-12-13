# 详细设计文档

## 系统架构

### 整体架构
```
用户浏览器 <-> Nginx(lit.linapp.fun) <-> Node.js后端(25080) <-> Claude API
                                                    ↓
                                            论文爬取服务
                                                    ↓
                                    ./paper ← → /mnt/lit/paper
```

### 技术栈
- **前端**: 纯HTML5 + CSS3 + 原生JavaScript (ES6+)
- **后端**: Node.js + Express框架
- **AI服务**: Claude API (Anthropic)
- **爬取工具**: axios + cheerio + puppeteer
- **存储**: 本地文件系统

## 前端设计

### 页面布局
```
+----------------------------------+
|       文献综述生成系统           |
+----------------------------------+
| [搜索框] [生成按钮]              |
+----------------------------------+
| ████████████░░░░░ 75%  (进度条)  |
+----------------------------------+
| ┌──────────────────────────┐    |
| │  文献综述内容（可滚动）   │    |
| │  ...                     │    |
| │  ...                     │    |
| └──────────────────────────┘    |
+----------------------------------+
| [全部下载]                       |
+----------------------------------+
| 论文列表表格                     |
| ┌─────┬────┬────┬────┬────┐    |
| │标题 │作者│年份│来源│操作│    |
| ├─────┼────┼────┼────┼────┤    |
| │...  │... │... │... │[⬇] │    |
| └─────┴────┴────┴────┴────┘    |
| ████░░░░░░ 40% (单篇进度)      |
+----------------------------------+
```

### 核心组件
1. **SearchBox**: 关键词输入和提交
2. **ProgressBar**: 综述生成和论文下载进度
3. **ReviewPanel**: 文献综述展示区（max-height: 400px, overflow-y: auto）
4. **PaperTable**: 论文列表表格
5. **DownloadManager**: 下载按钮和状态管理

## 后端设计

### API端点

#### 1. 生成文献综述
- **路径**: `POST /api/generate-review`
- **请求**: `{ keywords: string }`
- **响应**:
```json
{
  "review": "综述文本内容...",
  "papers": [
    {
      "title": "论文标题",
      "authors": ["作者1", "作者2"],
      "year": 2024,
      "venue": "期刊/会议名",
      "doi": "10.xxx/xxx",
      "url": "https://..."
    }
  ]
}
```

#### 2. 下载论文
- **路径**: `POST /api/download-paper`
- **请求**: `{ paperId: string, paperInfo: object }`
- **响应**:
```json
{
  "status": "success|failed",
  "localPath": "./paper/xxx.pdf",
  "webLink": "https://lit.linapp.fun/paper/xxx.pdf",
  "fallbackLink": "https://scholar.google.com/..."
}
```

#### 3. 批量下载
- **路径**: `POST /api/download-all`
- **请求**: `{ papers: array }`
- **响应**: Server-Sent Events (SSE) 流式返回每篇论文的下载状态

### 服务模块

#### ClaudeService
```javascript
class ClaudeService {
  async generateReview(keywords) {
    // 调用Claude API
    // 使用优化的提示词模板
    // 返回结构化JSON数据
  }
}
```

**提示词设计**:
```
你是一位资深的学术研究专家。请根据关键词"{keywords}"生成一篇深度文献综述（20段以上）。

综述结构：
1. 研究背景与意义（3-4段）
2. 核心研究方法概述（4-5段）
3. 主要研究发现与进展（6-8段）
4. 不同研究方向对比（3-4段）
5. 当前研究空白（2-3段）
6. 未来研究方向（2-3段）

请以JSON格式返回：
{
  "review": "完整综述文本，使用\n\n分隔段落",
  "papers": [
    {
      "title": "论文标题",
      "authors": ["作者1", "作者2"],
      "year": 2024,
      "venue": "期刊或会议名称",
      "doi": "DOI号（如有）",
      "url": "论文链接"
    }
  ]
}

要求：
- 引用15-30篇高质量论文
- 每篇论文信息必须真实准确
- 综述内容学术严谨、逻辑清晰
- 适当使用专业术语
```

#### DownloadService
```javascript
class DownloadService {
  async downloadPaper(paperInfo) {
    // 1. 检查./paper目录是否已存在
    // 2. 按优先级尝试下载源
    // 3. 保存到./paper目录
    // 4. 复制到/mnt/lit/paper
    // 5. 返回下载结果
  }

  async tryGoogleScholar(doi) { ... }
  async tryArxiv(title) { ... }
  async trySciHub(doi) { ... }
}
```

#### 爬取策略
```
1. Google Scholar (优先)
   - 使用DOI或标题搜索
   - 解析下载链接

2. arXiv (开放访问)
   - 匹配arXiv ID
   - 直接下载PDF

3. Sci-Hub (备用)
   - 使用DOI查询
   - 镜像站轮询
```

## 数据流设计

### 综述生成流程
```
用户输入关键词 → 前端发送请求 → 后端调用Claude API
                                        ↓
                            Claude生成综述+论文列表
                                        ↓
                            返回JSON数据 → 前端渲染
```

### 论文下载流程
```
用户点击下载 → 检查本地缓存 → 已存在：直接返回链接
                    ↓
                不存在：启动爬取任务
                    ↓
        Google Scholar → arXiv → Sci-Hub
                    ↓
        下载成功 → 保存到./paper → 复制到/mnt/lit/paper
                    ↓
                生成网盘链接 → 返回前端
                    ↓
        下载失败 → 返回Google Scholar外部链接
```

## 错误处理

1. **API调用失败**: 重试机制（最多3次）
2. **爬取失败**: 降级策略，提供手动下载链接
3. **网络超时**: 设置合理超时时间（30s）
4. **磁盘空间**: 检查可用空间，提前预警

## 性能优化

1. **并发控制**: 限制同时下载数量（最多5个）
2. **缓存机制**: 已下载论文不重复爬取
3. **流式响应**: 使用SSE实时推送下载进度
4. **懒加载**: 论文表格支持分页（每页20条）
