#!/usr/bin/env python3
"""
验证修复后的AI初老师功能
"""
import unittest
import sys
import os
import json
import tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.session_manager import SessionManager
from lib.ai_teacher_handler import AITeacherHandler


class TestFixedAITeacher(unittest.TestCase):
    """验证修复后的AI初老师功能"""

    def setUp(self):
        """测试前设置"""
        # 使用临时文件测试持久化
        self.temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        self.temp_file.close()
        self.handler = AITeacherHandler()
        self.handler.session_manager = SessionManager(self.temp_file.name)

    def tearDown(self):
        """测试后清理"""
        if os.path.exists(self.temp_file.name):
            os.unlink(self.temp_file.name)

    def test_persistent_sessions(self):
        """测试会话持久化"""
        # 创建会话
        user_id = "test_persist_001"
        self.handler.session_manager.create_session(user_id, "持久化用户")
        self.handler.session_manager.set_state(user_id, 'waiting_choice')

        # 创建新的SessionManager实例（模拟重启）
        new_manager = SessionManager(self.temp_file.name)

        # 验证会话被持久化
        session = new_manager.get_session(user_id)
        self.assertIsNotNone(session)
        self.assertEqual(session['state'], 'waiting_choice')
        self.assertEqual(session['user_nickname'], "持久化用户")

    def test_no_short_reply_on_error_state(self):
        """测试状态错误时不再返回短句"""
        user_id = "test_no_short"

        # 创建会话并设置错误状态
        self.handler.session_manager.create_session(user_id, "测试用户")
        self.handler.session_manager.set_state(user_id, 'unknown_state')

        # 发送消息
        reply = self.handler.handle_message(user_id, "测试用户", "你好", "chat_test")

        # 应该返回菜单而不是短句
        self.assertNotEqual(reply, "请先选择一个应用（输入两位数字，如：11、22、33）")
        self.assertIn("前端小游戏", reply)  # 应该包含菜单内容

    def test_message_count_fixed(self):
        """测试消息计数修复"""
        user_id = "test_count_fix"

        # 不创建会话，直接增加计数
        count = self.handler.session_manager.increment_message_count(user_id)

        # 应该返回1而不是0
        self.assertEqual(count, 1)

    def test_state_recovery(self):
        """测试状态恢复机制"""
        user_id = "test_recovery"

        # 创建会话
        self.handler.session_manager.create_session(user_id, "恢复用户")

        # 设置异常状态
        self.handler.session_manager.sessions[user_id]['state'] = 'error'
        self.handler.session_manager.sessions[user_id]['message_count'] = 10

        # 发送消息
        reply = self.handler.handle_message(user_id, "恢复用户", "重新开始", "chat_recover")

        # 验证恢复到正常状态
        session = self.handler.session_manager.get_session(user_id)
        self.assertEqual(session['state'], 'waiting_choice')
        self.assertIn("前端小游戏", reply)

    def test_concurrent_safety(self):
        """测试并发安全性"""
        user1 = "concurrent_user1"
        user2 = "concurrent_user2"

        # 两个用户同时操作
        reply1 = self.handler.handle_message(user1, "用户1", "你好", "chat1")
        reply2 = self.handler.handle_message(user2, "用户2", "你好", "chat2")

        # 验证各自的会话独立
        session1 = self.handler.session_manager.get_session(user1)
        session2 = self.handler.session_manager.get_session(user2)

        self.assertIsNotNone(session1)
        self.assertIsNotNone(session2)
        self.assertEqual(session1['user_nickname'], "用户1")
        self.assertEqual(session2['user_nickname'], "用户2")

        # 验证都收到菜单
        self.assertIn("前端小游戏", reply1)
        self.assertIn("前端小游戏", reply2)


if __name__ == '__main__':
    # 运行测试
    print("=== 运行修复验证测试 ===")
    unittest.main(verbosity=2)