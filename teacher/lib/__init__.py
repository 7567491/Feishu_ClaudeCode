#!/usr/bin/env python3
"""
AI初老师库模块
"""

from .feishu_client import FeishuClient
from .ai_teacher_handler import AITeacherHandler
from .menu_manager import MenuManager
from .pinyin_utils import PinyinConverter
from .port_manager import PortManager
from .project_manager import ProjectManager
from .bot2bot_client import Bot2BotClient
from .session_manager import SessionManager

__all__ = [
    "FeishuClient",
    "AITeacherHandler",
    "MenuManager",
    "PinyinConverter",
    "PortManager",
    "ProjectManager",
    "Bot2BotClient",
    "SessionManager"
]
__version__ = "2.0.0"