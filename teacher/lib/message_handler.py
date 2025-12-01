#!/usr/bin/env python3
"""
AI初老师消息处理器
负责解析用户消息、生成响应和调度任务
"""

import re
import logging
from typing import Dict, Any, Optional
from .feishu_client import FeishuClient

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MessageHandler:
    """消息处理器类"""

    def __init__(self, feishu_client: FeishuClient):
        """
        初始化消息处理器

        Args:
            feishu_client: 飞书客户端实例
        """
        self.feishu_client = feishu_client

        # 定义菜单选项
        self.menu_options = [
            {
                "icon": "🚀",
                "title": "快速开发",
                "description": "使用TDD方式开发新功能",
                "keywords": ["开发", "创建", "实现", "编写", "构建"]
            },
            {
                "icon": "🧪",
                "title": "测试验证",
                "description": "编写和运行测试用例",
                "keywords": ["测试", "验证", "检测", "单测"]
            },
            {
                "icon": "🐛",
                "title": "调试修复",
                "description": "定位并修复代码问题",
                "keywords": ["调试", "修复", "debug", "排查", "解决"]
            },
            {
                "icon": "📝",
                "title": "文档生成",
                "description": "自动生成代码文档",
                "keywords": ["文档", "注释", "说明", "doc"]
            },
            {
                "icon": "♻️",
                "title": "代码重构",
                "description": "优化和重构现有代码",
                "keywords": ["重构", "优化", "改进", "refactor"]
            },
            {
                "icon": "📊",
                "title": "代码分析",
                "description": "分析代码质量和性能",
                "keywords": ["分析", "检查", "审查", "review"]
            }
        ]

        # 任务模板
        self.task_templates = {
            "develop": """
🚀 开发任务：{content}

执行要求：
1. 使用TDD（测试驱动开发）方式
2. 先编写测试用例，确保覆盖主要场景
3. 实现功能代码，通过所有测试
4. 进行代码重构，保持测试通过
5. 添加必要的文档注释
6. 使用ultrathink深度思考最佳实践

请按照以上要求完成开发任务。
""",
            "test": """
🧪 测试任务：{content}

执行要求：
1. 编写完整的单元测试
2. 覆盖正常和异常场景
3. 使用mock模拟外部依赖
4. 确保测试独立可重复
5. 生成测试覆盖率报告
6. 修复发现的问题

请完成测试任务并提供结果。
""",
            "debug": """
🐛 调试任务：{content}

执行要求：
1. 复现问题场景
2. 使用日志和断点定位问题
3. 分析根本原因
4. 提供修复方案
5. 验证修复效果
6. 添加防止回归的测试

请完成调试任务。
""",
            "document": """
📝 文档任务：{content}

执行要求：
1. 生成清晰的API文档
2. 添加使用示例
3. 说明参数和返回值
4. 记录异常情况
5. 提供最佳实践建议

请完成文档任务。
""",
            "refactor": """
♻️ 重构任务：{content}

执行要求：
1. 保持功能不变
2. 提高代码可读性
3. 消除重复代码
4. 优化性能瓶颈
5. 确保测试通过
6. 记录重构内容

请完成重构任务。
""",
            "analyze": """
📊 分析任务：{content}

执行要求：
1. 检查代码质量
2. 分析性能瓶颈
3. 发现潜在问题
4. 提供改进建议
5. 生成分析报告

请完成分析任务。
"""
        }

    def parse_command(self, message: str) -> Dict[str, Any]:
        """
        解析用户消息，识别命令类型

        Args:
            message: 用户消息

        Returns:
            命令字典，包含type和content
        """
        message_lower = message.lower().strip()

        # 帮助命令
        if message_lower in ["帮助", "help", "菜单", "menu", "?"]:
            return {"type": "help", "content": None}

        # 检查各种任务类型
        for option in self.menu_options:
            for keyword in option["keywords"]:
                if keyword in message_lower:
                    # 根据关键词确定任务类型
                    type_map = {
                        "开发": "develop",
                        "测试": "test",
                        "调试": "debug",
                        "文档": "document",
                        "重构": "refactor",
                        "分析": "analyze"
                    }

                    task_type = None
                    for key, value in type_map.items():
                        if key in option["keywords"]:
                            task_type = value
                            break

                    if task_type:
                        return {
                            "type": task_type,
                            "content": message
                        }

        # 未识别的命令
        return {"type": "unknown", "content": message}

    def create_menu_card(self) -> Dict[str, Any]:
        """
        创建菜单卡片

        Returns:
            卡片内容字典
        """
        elements = []

        # 添加欢迎语
        elements.append({
            "tag": "div",
            "text": {
                "tag": "plain_text",
                "content": "我是AI初老师，您的智能开发助手。请选择需要的服务或直接描述您的需求："
            }
        })

        elements.append({"tag": "hr"})

        # 添加菜单选项
        for option in self.menu_options:
            elements.append({
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"{option['icon']} **{option['title']}**\n{option['description']}"
                },
                "extra": {
                    "tag": "button",
                    "text": {
                        "tag": "plain_text",
                        "content": "选择"
                    },
                    "type": "primary",
                    "value": {"action": option["keywords"][0]}
                }
            })

        # 添加使用说明
        elements.append({"tag": "hr"})
        elements.append({
            "tag": "note",
            "elements": [
                {
                    "tag": "plain_text",
                    "content": "💡 提示：您可以直接输入需求，如「开发一个用户登录功能」或「测试支付模块」"
                }
            ]
        })

        # 构建完整卡片
        card = {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": "🤖 AI初老师 - 智能开发助手"
                },
                "template": "blue"
            },
            "elements": elements
        }

        return card

    def format_task_message(self, task_type: str, content: str) -> str:
        """
        格式化任务消息

        Args:
            task_type: 任务类型
            content: 任务内容

        Returns:
            格式化后的消息
        """
        template = self.task_templates.get(task_type)

        if template:
            return template.format(content=content)
        else:
            return content

    def handle_message(self, message: str, chat_id: str) -> bool:
        """
        处理用户消息

        Args:
            message: 用户消息
            chat_id: 聊天ID

        Returns:
            是否处理成功
        """
        try:
            logger.info(f"Handling message: {message[:100]}...")

            # 解析命令
            command = self.parse_command(message)

            # 处理帮助命令
            if command["type"] == "help":
                card = self.create_menu_card()
                return self.feishu_client.send_card_message(chat_id, card)

            # 处理已知任务类型
            if command["type"] in self.task_templates:
                # 格式化任务消息
                formatted_message = self.format_task_message(command["type"], command["content"])

                # 调用小六API
                result = self.feishu_client.call_xiaoliu_api(
                    message=formatted_message,
                    chat_id=chat_id,
                    from_bot="AI初老师"
                )

                if result.get("success"):
                    logger.info(f"Task delegated successfully: {command['type']}")
                    return True
                else:
                    error_msg = result.get("error", "未知错误")
                    self.feishu_client.send_text_message(
                        chat_id,
                        f"❌ 任务处理失败：{error_msg}"
                    )
                    return False

            # 处理未知命令 - 直接转发给小六
            else:
                logger.info("Unknown command, forwarding to Xiaoliu...")

                result = self.feishu_client.call_xiaoliu_api(
                    message=message,
                    chat_id=chat_id,
                    from_bot="AI初老师"
                )

                if result.get("success"):
                    return True
                else:
                    # 发送帮助菜单
                    self.feishu_client.send_text_message(
                        chat_id,
                        "😊 我没有理解您的需求，让我展示可用的服务："
                    )
                    card = self.create_menu_card()
                    return self.feishu_client.send_card_message(chat_id, card)

        except Exception as e:
            logger.error(f"Error handling message: {str(e)}")
            self.feishu_client.send_text_message(
                chat_id,
                f"❌ 处理消息时发生错误：{str(e)}"
            )
            return False

    def handle_callback(self, callback_data: Dict[str, Any], chat_id: str) -> bool:
        """
        处理卡片回调

        Args:
            callback_data: 回调数据
            chat_id: 聊天ID

        Returns:
            是否处理成功
        """
        try:
            action = callback_data.get("value", {}).get("action")

            if action:
                # 生成对应的消息
                message = f"{action}功能"
                return self.handle_message(message, chat_id)

            return False

        except Exception as e:
            logger.error(f"Error handling callback: {str(e)}")
            return False