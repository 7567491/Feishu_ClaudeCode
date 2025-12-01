#!/usr/bin/env python3
"""
AI初老师消息处理器测试用例
TDD开发方式 - 先写测试，后写实现
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.message_handler import MessageHandler

class TestMessageHandler(unittest.TestCase):
    """测试消息处理器类"""

    def setUp(self):
        """测试前准备"""
        self.mock_client = Mock()
        self.handler = MessageHandler(self.mock_client)
        self.test_chat_id = "oc_15a90daa813d981076ffa50c0de0b5e4"

    def test_init(self):
        """测试初始化"""
        self.assertEqual(self.handler.feishu_client, self.mock_client)
        self.assertIsNotNone(self.handler.menu_options)

    def test_parse_command(self):
        """测试命令解析"""
        # 测试开发命令
        cmd = self.handler.parse_command("开发一个扫雷游戏")
        self.assertEqual(cmd['type'], 'develop')
        self.assertEqual(cmd['content'], "开发一个扫雷游戏")

        # 测试测试命令
        cmd = self.handler.parse_command("测试登录功能")
        self.assertEqual(cmd['type'], 'test')
        self.assertEqual(cmd['content'], "测试登录功能")

        # 测试调试命令
        cmd = self.handler.parse_command("调试数据库连接问题")
        self.assertEqual(cmd['type'], 'debug')
        self.assertEqual(cmd['content'], "调试数据库连接问题")

        # 测试文档命令
        cmd = self.handler.parse_command("生成API文档")
        self.assertEqual(cmd['type'], 'document')
        self.assertEqual(cmd['content'], "生成API文档")

        # 测试重构命令
        cmd = self.handler.parse_command("重构用户认证模块")
        self.assertEqual(cmd['type'], 'refactor')
        self.assertEqual(cmd['content'], "重构用户认证模块")

        # 测试帮助命令
        cmd = self.handler.parse_command("帮助")
        self.assertEqual(cmd['type'], 'help')

        # 测试未知命令
        cmd = self.handler.parse_command("随机内容")
        self.assertEqual(cmd['type'], 'unknown')

    def test_create_menu_card(self):
        """测试创建菜单卡片"""
        card = self.handler.create_menu_card()

        # 验证卡片结构
        self.assertIn('config', card)
        self.assertIn('header', card)
        self.assertIn('elements', card)

        # 验证标题
        self.assertEqual(card['header']['title']['content'], "🤖 AI初老师 - 智能开发助手")

        # 验证有菜单选项
        self.assertGreater(len(card['elements']), 0)

    def test_handle_message_help(self):
        """测试处理帮助消息"""
        # Mock发送卡片消息
        self.mock_client.send_card_message = Mock(return_value=True)

        # 处理帮助消息
        result = self.handler.handle_message("帮助", self.test_chat_id)

        # 验证
        self.assertTrue(result)
        self.mock_client.send_card_message.assert_called_once()

        # 验证调用参数
        call_args = self.mock_client.send_card_message.call_args
        self.assertEqual(call_args[0][0], self.test_chat_id)

    def test_handle_message_develop(self):
        """测试处理开发消息"""
        # Mock调用小六API
        self.mock_client.call_xiaoliu_api = Mock(return_value={'success': True})

        # 处理开发消息
        result = self.handler.handle_message("开发一个记事本应用", self.test_chat_id)

        # 验证
        self.assertTrue(result)
        self.mock_client.call_xiaoliu_api.assert_called_once()

        # 验证调用参数
        call_args = self.mock_client.call_xiaoliu_api.call_args
        kwargs = call_args[1]
        self.assertIn("开发一个记事本应用", kwargs['message'])
        self.assertEqual(kwargs['chat_id'], self.test_chat_id)
        self.assertEqual(kwargs['from_bot'], "AI初老师")

    def test_handle_message_with_context(self):
        """测试处理带上下文的消息"""
        # Mock调用小六API
        self.mock_client.call_xiaoliu_api = Mock(return_value={'success': True})

        # 测试开发任务 - 应该包含详细指令
        self.handler.handle_message("开发用户登录模块", self.test_chat_id)
        call_args = self.mock_client.call_xiaoliu_api.call_args[1]
        self.assertIn("使用TDD", call_args['message'])

        # 测试测试任务 - 应该包含测试指令
        self.handler.handle_message("测试支付功能", self.test_chat_id)
        call_args = self.mock_client.call_xiaoliu_api.call_args[1]
        self.assertIn("单元测试", call_args['message'])

        # 测试调试任务 - 应该包含调试指令
        self.handler.handle_message("调试网络请求错误", self.test_chat_id)
        call_args = self.mock_client.call_xiaoliu_api.call_args[1]
        self.assertIn("日志", call_args['message'])

    def test_handle_error(self):
        """测试错误处理"""
        # Mock API调用失败
        self.mock_client.call_xiaoliu_api = Mock(return_value={'success': False, 'error': 'API错误'})
        self.mock_client.send_text_message = Mock()

        # 处理消息
        result = self.handler.handle_message("开发测试", self.test_chat_id)

        # 验证错误处理
        self.assertFalse(result)
        self.mock_client.send_text_message.assert_called()

        # 验证错误消息
        call_args = self.mock_client.send_text_message.call_args
        self.assertIn("错误", call_args[0][1])

    def test_format_task_message(self):
        """测试任务消息格式化"""
        # 测试开发任务格式化
        msg = self.handler.format_task_message("develop", "创建REST API")
        self.assertIn("开发任务", msg)
        self.assertIn("创建REST API", msg)
        self.assertIn("TDD", msg)

        # 测试测试任务格式化
        msg = self.handler.format_task_message("test", "测试用户注册")
        self.assertIn("测试任务", msg)
        self.assertIn("测试用户注册", msg)
        self.assertIn("单元测试", msg)

        # 测试调试任务格式化
        msg = self.handler.format_task_message("debug", "修复内存泄漏")
        self.assertIn("调试任务", msg)
        self.assertIn("修复内存泄漏", msg)

if __name__ == '__main__':
    unittest.main()