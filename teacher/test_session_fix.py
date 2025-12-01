#!/usr/bin/env python3
"""
TDD测试用例：验证和修复AI初老师会话管理问题
"""
import unittest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.session_manager import SessionManager
from lib.ai_teacher_handler import AITeacherHandler


class TestSessionManagement(unittest.TestCase):
    """测试会话管理功能"""

    def setUp(self):
        """测试前设置"""
        self.session_manager = SessionManager()
        self.handler = AITeacherHandler()

    def test_first_message_without_session(self):
        """测试：用户第一次发消息，没有会话时的处理"""
        user_id = "test_user_001"
        user_nickname = "测试用户"
        message = "你好"
        chat_id = "test_chat_001"

        # 第一次消息应该返回完整菜单
        reply = self.handler.handle_message(user_id, user_nickname, message, chat_id)

        # 验证返回了菜单（包含选项）
        self.assertIn("您好，我是AI初老师", reply)
        self.assertIn("11-扫雷", reply)
        self.assertIn("33-简易日历", reply)

    def test_second_message_not_choice(self):
        """测试：用户第二次发消息，但不是有效选择"""
        user_id = "test_user_002"
        user_nickname = "测试用户2"
        chat_id = "test_chat_002"

        # 第一次消息
        reply1 = self.handler.handle_message(user_id, user_nickname, "你好", chat_id)

        # 第二次消息（不是有效选择）应再次返回完整菜单
        reply2 = self.handler.handle_message(user_id, user_nickname, "hello", chat_id)
        self.assertIn("11-扫雷", reply2)
        self.assertIn("33-简易日历", reply2)

    def test_message_count_increment(self):
        """测试：消息计数正确递增"""
        user_id = "test_user_003"
        user_nickname = "测试用户3"

        # 创建会话
        session = self.session_manager.create_session(user_id, user_nickname)

        # 测试消息计数
        count1 = self.session_manager.increment_message_count(user_id)
        self.assertEqual(count1, 1)

        count2 = self.session_manager.increment_message_count(user_id)
        self.assertEqual(count2, 2)

    def test_message_count_without_session(self):
        """测试：没有会话时的消息计数处理"""
        user_id = "test_user_004"

        # 直接增加消息计数（没有创建会话）
        count = self.session_manager.increment_message_count(user_id)

        # 应该自动视为第一条消息并返回1
        self.assertEqual(count, 1)

    def test_session_state_transitions(self):
        """测试：会话状态转换"""
        user_id = "test_user_005"
        user_nickname = "测试用户5"

        # 创建会话
        session = self.session_manager.create_session(user_id, user_nickname)
        self.assertEqual(session['state'], 'menu')

        # 设置为waiting_choice
        self.session_manager.set_state(user_id, 'waiting_choice')
        session = self.session_manager.get_session(user_id)
        self.assertEqual(session['state'], 'waiting_choice')

        # 选择应用后设置为processing
        self.session_manager.set_selected_app(user_id, 11, {'name': '测试应用'})
        session = self.session_manager.get_session(user_id)
        self.assertEqual(session['state'], 'processing')

    def test_concurrent_message_handling(self):
        """测试：并发消息处理"""
        user_id = "test_user_006"
        user_nickname = "测试用户6"
        chat_id = "test_chat_006"

        # 模拟两个快速连续的消息
        reply1 = self.handler.handle_message(user_id, user_nickname, "你好", chat_id)
        reply2 = self.handler.handle_message(user_id, user_nickname, "11", chat_id)

        # 第二个消息应该被正确处理为选择并返回对应提示词
        self.assertIn("开发一个小游戏", reply2)
        self.assertIn("扫雷", reply2)


class TestFixedSessionManagement(unittest.TestCase):
    """测试修复后的会话管理"""

    def test_fixed_message_count_logic(self):
        """测试：修复后的消息计数逻辑"""
        # 这里测试修复后的逻辑
        pass


if __name__ == '__main__':
    # 运行测试
    unittest.main(verbosity=2)
