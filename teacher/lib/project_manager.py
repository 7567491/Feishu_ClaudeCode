#!/usr/bin/env python3
"""
项目管理器 - 管理项目创建和Prompt生成
"""
import os
from datetime import datetime
from typing import Optional, Dict
import json


class ProjectManager:
    """项目管理器"""

    def __init__(self, base_dir: str = "/home/ccp/feicc", prompts_file: str = None):
        """
        初始化项目管理器

        Args:
            base_dir: 项目基础目录
            prompts_file: 提示词配置文件路径
        """
        self.base_dir = base_dir
        self.prompts = self._load_prompts(prompts_file)

    def _load_prompts(self, prompts_file: Optional[str]) -> Dict[str, str]:
        """
        加载提示词配置

        Args:
            prompts_file: 配置文件路径

        Returns:
            包含前端和全栈提示词的字典
        """
        # 默认路径：teacher/prompts.json
        default_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "prompts.json"
        )
        file_path = prompts_file or default_path

        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return {
                    "frontend_prompt": data.get("frontend_prompt", ""),
                    "fullstack_prompt": data.get("fullstack_prompt", "")
                }
            except Exception:
                pass

        # 回退默认模板（保持与chu.md一致）
        return {
            "frontend_prompt": (
                "开发一个小游戏，小游戏名称：{app_name}，使用单网页html架构\n"
                "HTML标题显示：{user_nickname}的{app_name}\n"
                "文件名{user_pinyin}_{app_pinyin}.html，拷贝到挂载网盘/mnt/www, 并使得域名https://s.linapp.fun/{user_pinyin}_{app_pinyin}.html可访问"
            ),
            "fullstack_prompt": (
                "开发一个前端html+后端python+json格式数据存储的应用\n"
                "项目目录={project_dir}, 所有相关文件放在项目目录里\n\n"
                "在目录里依次生成三个md文件：\n"
                "需求文档need(不超过500字) 架构设计文档design(不超过800字)\n"
                "计划和具体任务文档plan(不超过500字)，每个任务前面放[ ]表示开发完成/未完成\n"
                "每生成一个md文件，就发送md文件到本对话\n\n"
                "前端开发说明：使用单html网页，HTML标题显示\"{user_nickname}的{app_name}\"，适当美化，能够适配手机端\n"
                "后端架构说明：使用python，后端端口（如果需要）：端口占用表存放在/home/ccp/teacher/port.csv, 选择57001开始的端口，如果端口已经被占用则+1，直到找到没有被占用的端口，并记录到表里\n"
                "数据存储：使用json格式，设计合适的数据格式\n"
                "运维说明：配置nginx使用https://s.linapp.fun/{user_pinyin}_{app_pinyin}.html作为域名，并测试可访问\n\n"
                "直到全部开发完毕生成md格式文件readme（800字以内）并发送到本对话"
            )
        }

    def create_project_dir(self, user_pinyin: str, app_id: int) -> str:
        """
        创建项目目录

        Args:
            user_pinyin: 用户昵称拼音
            app_id: 应用编号

        Returns:
            项目目录路径
        """
        project_name = f"{user_pinyin}_{app_id}"
        project_dir = os.path.join(self.base_dir, project_name)
        os.makedirs(project_dir, exist_ok=True)
        return project_dir

    def generate_frontend_prompt(
        self,
        user_nickname: str,
        user_pinyin: str,
        app_name: str,
        app_pinyin: str
    ) -> str:
        """
        生成前端应用Prompt

        Args:
            user_nickname: 用户昵称
            user_pinyin: 用户昵称拼音
            app_name: 应用名称
            app_pinyin: 应用名称拼音

        Returns:
            Prompt文本
        """
        template = self.prompts.get("frontend_prompt")
        return template.format(
            app_name=app_name,
            user_nickname=user_nickname,
            user_pinyin=user_pinyin,
            app_pinyin=app_pinyin
        )

    def generate_fullstack_prompt(
        self,
        user_nickname: str,
        user_pinyin: str,
        app_name: str,
        app_pinyin: str,
        app_id: int,
        project_dir: str
    ) -> str:
        """
        生成全栈应用Prompt

        Args:
            user_nickname: 用户昵称
            user_pinyin: 用户昵称拼音
            app_name: 应用名称
            app_pinyin: 应用名称拼音
            app_id: 应用编号
            project_dir: 项目目录名

        Returns:
            Prompt文本
        """
        template = self.prompts.get("fullstack_prompt")
        return template.format(
            user_nickname=user_nickname,
            user_pinyin=user_pinyin,
            app_name=app_name,
            app_pinyin=app_pinyin,
            project_dir=project_dir
        )

    def generate_bot2bot_message(
        self,
        user_nickname: str,
        user_pinyin: str,
        app_id: int,
        app_name: str,
        prompt: str
    ) -> str:
        """
        生成Bot-to-Bot消息

        Args:
            user_nickname: 用户昵称
            user_pinyin: 用户昵称拼音
            app_id: 应用编号
            app_name: 应用名称
            prompt: 要发送的Prompt

        Returns:
            Bot-to-Bot消息文本
        """
        message = f"""已为【{user_nickname}】创建项目：{user_pinyin}_{app_id}

📋 发送给小六的任务：
{prompt}
小六
机器人
Claude Code后台应用
🤖 AI初老师已将任务转发给我，正在处理中..."""
        return message

    def create_need_doc(self, project_dir: str, app_name: str, user_nickname: str) -> str:
        """
        创建需求文档

        Args:
            project_dir: 项目目录
            app_name: 应用名称
            user_nickname: 用户昵称

        Returns:
            文档路径
        """
        doc_path = os.path.join(project_dir, "need.md")
        content = f"""# {app_name} - 需求文档

## 项目概述
为{user_nickname}开发的{app_name}应用，提供便捷的在线服务。

## 功能需求
### 核心功能
1. **基础功能**
   - 用户界面友好，操作简单直观
   - 支持基本的{app_name}功能
   - 数据本地持久化存储

2. **用户体验**
   - 响应式设计，适配手机和PC端
   - 界面美观，色彩协调
   - 交互流畅，反馈及时

### 技术要求
- 前端：HTML5 + CSS3 + JavaScript
- 后端：Python Flask框架
- 数据存储：JSON文件
- 部署：Nginx反向代理

## 目标用户
主要面向需要使用{app_name}功能的个人用户，提供简单易用的在线工具。

## 项目价值
通过本项目，用户可以快速使用{app_name}功能，提高工作效率。

*创建时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""
        with open(doc_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return doc_path

    def create_design_doc(self, project_dir: str, app_name: str) -> str:
        """
        创建架构设计文档

        Args:
            project_dir: 项目目录
            app_name: 应用名称

        Returns:
            文档路径
        """
        doc_path = os.path.join(project_dir, "design.md")
        content = f"""# {app_name} - 架构设计文档

## 系统架构
### 总体架构
采用前后端分离的架构模式：
- **前端层**：单页HTML应用，负责用户界面展示和交互
- **后端层**：Python Flask服务，处理业务逻辑
- **数据层**：JSON文件存储，实现数据持久化

### 技术栈
#### 前端技术
- HTML5：页面结构
- CSS3：样式设计，包括响应式布局
- JavaScript (ES6+)：交互逻辑实现
- Fetch API：前后端通信

#### 后端技术
- Python 3.8+：开发语言
- Flask 2.0+：Web框架
- JSON：数据格式
- CORS：跨域支持

## 模块设计
### 前端模块
1. **界面组件**
   - 头部导航区
   - 主要功能区
   - 操作按钮区
   - 状态显示区

2. **交互逻辑**
   - 事件监听处理
   - 数据验证
   - API调用封装
   - 错误处理

### 后端模块
1. **API接口**
   - RESTful风格设计
   - 统一的响应格式
   - 错误码规范

2. **业务逻辑**
   - 数据处理
   - 状态管理
   - 业务规则实现

3. **数据访问**
   - JSON文件读写
   - 数据缓存
   - 并发控制

## 接口设计
### API规范
- 基础路径：`/api/v1`
- 请求格式：JSON
- 响应格式：`{{"code": 0, "data": {{}}, "message": "success"}}`

### 主要接口
- GET `/api/v1/status` - 获取状态
- POST `/api/v1/create` - 创建资源
- PUT `/api/v1/update/:id` - 更新资源
- DELETE `/api/v1/delete/:id` - 删除资源

## 部署架构
- Nginx作为反向代理
- Flask应用通过PM2管理
- 静态文件由Nginx直接服务

*创建时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""
        with open(doc_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return doc_path

    def create_plan_doc(self, project_dir: str, app_name: str) -> str:
        """
        创建计划文档

        Args:
            project_dir: 项目目录
            app_name: 应用名称

        Returns:
            文档路径
        """
        doc_path = os.path.join(project_dir, "plan.md")
        content = f"""# {app_name} - 计划和任务文档

## 开发计划
### 第一阶段：基础搭建（1小时）
- [ ] 创建项目目录结构
- [ ] 初始化前端HTML页面
- [ ] 搭建Flask后端框架
- [ ] 配置基础路由

### 第二阶段：功能开发（2小时）
- [ ] 实现前端界面设计
- [ ] 开发核心功能模块
- [ ] 实现前后端API通信
- [ ] 添加数据存储功能

### 第三阶段：优化完善（1小时）
- [ ] 界面美化和响应式适配
- [ ] 错误处理和边界测试
- [ ] 性能优化
- [ ] 添加用户提示

### 第四阶段：部署上线（30分钟）
- [ ] 配置Nginx反向代理
- [ ] 设置域名解析
- [ ] 启动后端服务
- [ ] 功能测试验证

## 具体任务
### 前端任务
- [ ] 创建index.html主页面
- [ ] 编写CSS样式文件
- [ ] 实现JavaScript交互逻辑
- [ ] 添加加载动画和提示

### 后端任务
- [ ] 创建app.py主程序
- [ ] 实现API接口
- [ ] 添加数据处理逻辑
- [ ] 配置CORS和错误处理

### 测试任务
- [ ] 功能测试
- [ ] 兼容性测试
- [ ] 性能测试
- [ ] 安全测试

## 时间安排
预计总时长：4-5小时
- 开发时间：3.5小时
- 测试时间：0.5小时
- 部署时间：0.5小时
- 文档编写：0.5小时

*创建时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""
        with open(doc_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return doc_path
