#!/usr/bin/env python3
"""
AI初老师库模块
"""

from .feishu_client import FeishuClient
from .message_handler import MessageHandler

__all__ = ["FeishuClient", "MessageHandler"]
__version__ = "1.0.0"