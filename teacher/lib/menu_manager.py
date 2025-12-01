#!/usr/bin/env python3
"""
菜单管理器 - 管理AI初老师的交互菜单
"""
import logging
import re
from typing import Optional, Dict

logger = logging.getLogger(__name__)


class MenuManager:
    """菜单管理器"""

    def __init__(self):
        """初始化菜单管理器"""
        # 定义应用菜单
        self.apps = {
            # 前端小游戏
            11: {"name": "扫雷", "category": "frontend_game", "type": "game"},
            12: {"name": "贪吃蛇", "category": "frontend_game", "type": "game"},
            13: {"name": "五子棋", "category": "frontend_game", "type": "game"},
            # 前端小应用
            21: {"name": "计算器", "category": "frontend_app", "type": "app"},
            22: {"name": "绘画板", "category": "frontend_app", "type": "app"},
            23: {"name": "倒计时器", "category": "frontend_app", "type": "app"},
            # 全栈小应用
            31: {"name": "任务待办清单", "category": "fullstack_app", "type": "fullstack"},
            32: {"name": "简易博客", "category": "fullstack_app", "type": "fullstack"},
            33: {"name": "简易日历", "category": "fullstack_app", "type": "fullstack"},
        }

    def generate_menu(self, user_nickname: str) -> str:
        """
        生成欢迎菜单

        Args:
            user_nickname: 用户昵称

        Returns:
            菜单文本
        """
        menu = f"""{user_nickname}您好，我是AI初老师，我带你开始AI编程之旅，一键生成云上应用
【前端小游戏】
11-扫雷
12-贪吃蛇
13-五子棋
【前端小应用】
21-计算器
22-绘画板
23-倒计时器
【全栈小应用】
31-任务待办清单
32-简易博客
33-简易日历
请直接回复两位数字选择（如：11、22、33）"""
        return menu

    def parse_choice(self, user_input: str) -> Optional[int]:
        """
        解析用户选择

        Args:
            user_input: 用户输入

        Returns:
            应用编号，无效时返回None
        """
        logger.info(f"Parsing user choice: '{user_input}'")

        try:
            # 先去掉首尾空白
            cleaned_input = (user_input or "").strip()
            logger.debug(f"After strip: '{cleaned_input}'")

            # 提取数字片段（处理“11”、“11@bot”、“11-扫雷”、“我选11”等形式）
            digit_matches = re.findall(r'\d+', cleaned_input)
            if not digit_matches:
                raise ValueError("no digits found")

            token = digit_matches[0][:2]  # 只取前两位数字
            logger.debug(f"Extracted digit token: '{token}'")

            choice = int(token)
            logger.info(f"Parsed choice: {choice}")

            if choice in self.apps:
                logger.info(f"Valid choice: {choice} -> {self.apps[choice]['name']}")
                return choice
            else:
                logger.warning(f"Choice {choice} not found in apps")
        except (ValueError, AttributeError) as e:
            logger.warning(f"Failed to parse choice: {e}")
            pass
        return None

    def get_app_info(self, app_id: int) -> Optional[Dict]:
        """
        获取应用信息

        Args:
            app_id: 应用编号

        Returns:
            应用信息字典，不存在时返回None
        """
        return self.apps.get(app_id)

    def is_frontend_app(self, app_id: int) -> bool:
        """
        判断是否为前端应用（游戏或应用）

        Args:
            app_id: 应用编号

        Returns:
            True if frontend, False otherwise
        """
        app_info = self.get_app_info(app_id)
        if app_info:
            return app_info['category'] in ['frontend_game', 'frontend_app']
        return False

    def is_fullstack_app(self, app_id: int) -> bool:
        """
        判断是否为全栈应用

        Args:
            app_id: 应用编号

        Returns:
            True if fullstack, False otherwise
        """
        app_info = self.get_app_info(app_id)
        if app_info:
            return app_info['category'] == 'fullstack_app'
        return False
