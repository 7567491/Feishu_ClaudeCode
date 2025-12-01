#!/usr/bin/env python3
"""
菜单管理器测试用例
"""
import unittest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.menu_manager import MenuManager


class TestMenuManager(unittest.TestCase):
    """菜单管理器测试"""

    def setUp(self):
        """测试初始化"""
        self.menu_manager = MenuManager()

    def test_generate_welcome_menu(self):
        """测试生成欢迎菜单"""
        menu = self.menu_manager.generate_menu("张三")

        # 检查必要内容
        self.assertIn("张三您好", menu)
        self.assertIn("AI初老师", menu)
        self.assertIn("【前端小游戏】", menu)
        self.assertIn("11-扫雷", menu)
        self.assertIn("12-贪吃蛇", menu)
        self.assertIn("13-五子棋", menu)
        self.assertIn("【前端小应用】", menu)
        self.assertIn("21-计算器", menu)
        self.assertIn("22-绘画板", menu)
        self.assertIn("23-倒计时器", menu)
        self.assertIn("【全栈小应用】", menu)
        self.assertIn("31-任务待办清单", menu)
        self.assertIn("32-简易博客", menu)
        self.assertIn("33-简易日历", menu)

    def test_parse_user_choice_valid(self):
        """测试解析有效的用户选择"""
        self.assertEqual(self.menu_manager.parse_choice("11"), 11)
        self.assertEqual(self.menu_manager.parse_choice("21"), 21)
        self.assertEqual(self.menu_manager.parse_choice("31"), 31)
        self.assertEqual(self.menu_manager.parse_choice("33"), 33)

    def test_parse_user_choice_invalid(self):
        """测试解析无效的用户选择"""
        self.assertIsNone(self.menu_manager.parse_choice(""))
        self.assertIsNone(self.menu_manager.parse_choice("abc"))
        self.assertIsNone(self.menu_manager.parse_choice("99"))
        self.assertIsNone(self.menu_manager.parse_choice("1"))
        self.assertIsNone(self.menu_manager.parse_choice("111"))

    def test_get_app_info(self):
        """测试获取应用信息"""
        # 前端小游戏
        info = self.menu_manager.get_app_info(11)
        self.assertEqual(info['name'], "扫雷")
        self.assertEqual(info['category'], "frontend_game")
        self.assertEqual(info['type'], "game")

        # 前端小应用
        info = self.menu_manager.get_app_info(21)
        self.assertEqual(info['name'], "计算器")
        self.assertEqual(info['category'], "frontend_app")
        self.assertEqual(info['type'], "app")

        # 全栈小应用
        info = self.menu_manager.get_app_info(31)
        self.assertEqual(info['name'], "任务待办清单")
        self.assertEqual(info['category'], "fullstack_app")
        self.assertEqual(info['type'], "fullstack")

    def test_get_app_info_invalid(self):
        """测试获取无效应用信息"""
        info = self.menu_manager.get_app_info(99)
        self.assertIsNone(info)

    def test_is_frontend_app(self):
        """测试判断是否为前端应用"""
        self.assertTrue(self.menu_manager.is_frontend_app(11))
        self.assertTrue(self.menu_manager.is_frontend_app(13))
        self.assertTrue(self.menu_manager.is_frontend_app(21))
        self.assertTrue(self.menu_manager.is_frontend_app(23))
        self.assertFalse(self.menu_manager.is_frontend_app(31))
        self.assertFalse(self.menu_manager.is_frontend_app(33))

    def test_is_fullstack_app(self):
        """测试判断是否为全栈应用"""
        self.assertFalse(self.menu_manager.is_fullstack_app(11))
        self.assertFalse(self.menu_manager.is_fullstack_app(21))
        self.assertTrue(self.menu_manager.is_fullstack_app(31))
        self.assertTrue(self.menu_manager.is_fullstack_app(33))


if __name__ == "__main__":
    unittest.main()