#!/usr/bin/env python3
"""
AI初老师主消息处理器
"""
import logging
import os
from typing import Dict, Optional, Tuple

from .menu_manager import MenuManager
from .pinyin_utils import PinyinConverter
from .port_manager import PortManager
from .project_manager import ProjectManager
from .bot2bot_client import Bot2BotClient
from .session_manager import SessionManager


logger = logging.getLogger(__name__)


class AITeacherHandler:
    """AI初老师主处理器"""

    def __init__(self, feishu_client=None):
        """
        初始化处理器

        Args:
            feishu_client: 飞书客户端
        """
        self.feishu_client = feishu_client
        self.menu_manager = MenuManager()
        self.pinyin_converter = PinyinConverter()
        self.port_manager = PortManager()
        self.project_manager = ProjectManager()
        self.bot2bot_client = Bot2BotClient()
        self.session_manager = SessionManager()

        logger.info("AI初老师处理器初始化完成")

    def handle_message(
        self,
        user_id: str,
        user_nickname: str,
        message: str,
        chat_id: str
    ) -> str:
        """
        处理用户消息

        Args:
            user_id: 用户ID
            user_nickname: 用户昵称
            message: 消息内容
            chat_id: 对话ID

        Returns:
            回复内容
        """
        try:
            # 获取或创建会话
            session = self.session_manager.get_session(user_id)
            if not session:
                session = self.session_manager.create_session(user_id, user_nickname)
                logger.info(f"Created new session for user: {user_nickname} ({user_id})")

            # 增加消息计数
            self.session_manager.increment_message_count(user_id)
            parsed_choice = self.menu_manager.parse_choice(message)

            # 非9个编号 -> 返回完整菜单
            if not parsed_choice:
                self.session_manager.set_state(user_id, 'waiting_choice')
                menu = self.menu_manager.generate_menu(user_nickname)
                logger.info(f"Showing menu to user: {user_nickname}")
                return menu

            # 9个编号 -> 处理选择并返回对应提示词
            self.session_manager.set_state(user_id, 'waiting_choice')
            return self._handle_user_choice(
                user_id,
                user_nickname,
                message,
                chat_id,
                app_id=parsed_choice
            )

        except Exception as e:
            logger.error(f"Error handling message: {str(e)}")
            return f"处理消息时出现错误：{str(e)}"

    def _handle_user_choice(
        self,
        user_id: str,
        user_nickname: str,
        choice_str: str,
        chat_id: str,
        app_id: int = None
    ) -> str:
        """
        处理用户选择

        Args:
            user_id: 用户ID
            user_nickname: 用户昵称
            choice_str: 用户输入的选择
            chat_id: 对话ID

        Returns:
            回复内容
        """
        # 解析选择
        app_id = app_id or self.menu_manager.parse_choice(choice_str)
        if not app_id:
            return self.menu_manager.generate_menu(user_nickname)

        # 获取应用信息
        app_info = self.menu_manager.get_app_info(app_id)
        if not app_info:
            return self.menu_manager.generate_menu(user_nickname)

        # 更新会话状态
        self.session_manager.set_selected_app(user_id, app_id, app_info)

        # 生成拼音
        user_pinyin = self.pinyin_converter.convert(user_nickname)
        app_pinyin = self.pinyin_converter.convert(app_info['name'])

        logger.info(f"User {user_nickname} selected: {app_info['name']} (ID: {app_id})")

        # 创建项目目录
        project_dir = self.project_manager.create_project_dir(user_pinyin, app_id)
        project_name = f"{user_pinyin}_{app_id}"

        # 根据应用类型生成Prompt
        if self.menu_manager.is_frontend_app(app_id):
            prompt = self.project_manager.generate_frontend_prompt(
                user_nickname=user_nickname,
                user_pinyin=user_pinyin,
                app_name=app_info['name'],
                app_pinyin=app_pinyin
            )
        else:
            # 全栈应用，分配端口
            port = self.port_manager.allocate_port(
                f"{user_pinyin}_{app_pinyin}",
                user_nickname
            )
            logger.info(f"Allocated port {port} for {project_name}")

            prompt = self.project_manager.generate_fullstack_prompt(
                user_nickname=user_nickname,
                user_pinyin=user_pinyin,
                app_name=app_info['name'],
                app_pinyin=app_pinyin,
                app_id=app_id,
                project_dir=project_name
            )

            # 创建文档（全栈应用）
            self.project_manager.create_need_doc(project_dir, app_info['name'], user_nickname)
            self.project_manager.create_design_doc(project_dir, app_info['name'])
            self.project_manager.create_plan_doc(project_dir, app_info['name'])

        # 发送给小六
        result = self.bot2bot_client.send_to_xiaoliu(
            prompt=prompt,
            user_id=user_id,
            chat_id=chat_id,
            from_bot="AI初老师"
        )

        if result.get('success'):
            logger.info("Successfully sent task to XiaoLiu")
        else:
            logger.error(f"Failed to send to XiaoLiu: {result.get('error')}")
            prompt += f"\n\n⚠️ 发送给小六失败：{result.get('error')}"

        # 直接回复对应提示词（前端/全栈两种Prompt之一）
        return prompt

    def reset_session(self, user_id: str) -> bool:
        """
        重置用户会话

        Args:
            user_id: 用户ID

        Returns:
            是否成功
        """
        return self.session_manager.clear_session(user_id)
