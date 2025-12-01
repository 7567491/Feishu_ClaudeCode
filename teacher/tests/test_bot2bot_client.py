#!/usr/bin/env python3
"""
Bot-to-Bot客户端测试用例
"""
import unittest
from unittest.mock import Mock, patch
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.bot2bot_client import Bot2BotClient


class TestBot2BotClient(unittest.TestCase):
    """Bot-to-Bot客户端测试"""

    def setUp(self):
        """测试初始化"""
        self.client = Bot2BotClient(
            api_url="http://localhost:3011/api/feishu-proxy/query"
        )

    @patch('requests.post')
    def test_send_to_xiaoliu_success(self, mock_post):
        """测试成功发送给小六"""
        # 模拟成功响应
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": True,
            "data": {"message": "处理成功"}
        }
        mock_post.return_value = mock_response

        result = self.client.send_to_xiaoliu(
            prompt="测试任务",
            user_id="test_user",
            chat_id="test_chat"
        )

        self.assertTrue(result['success'])
        self.assertEqual(result['data']['message'], "处理成功")
        mock_post.assert_called_once()

    @patch('requests.post')
    def test_send_to_xiaoliu_failure(self, mock_post):
        """测试发送失败"""
        # 模拟失败响应
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        result = self.client.send_to_xiaoliu(
            prompt="测试任务",
            user_id="test_user",
            chat_id="test_chat"
        )

        self.assertFalse(result['success'])
        self.assertIn('error', result)

    @patch('requests.post')
    def test_send_to_xiaoliu_timeout(self, mock_post):
        """测试发送超时"""
        # 模拟超时异常
        mock_post.side_effect = Exception("Connection timeout")

        result = self.client.send_to_xiaoliu(
            prompt="测试任务",
            user_id="test_user",
            chat_id="test_chat"
        )

        self.assertFalse(result['success'])
        self.assertIn('Connection timeout', result['error'])

    def test_format_bot_message(self):
        """测试格式化机器人消息"""
        message = self.client.format_bot_message(
            from_bot="AI初老师",
            to_bot="小六",
            content="请帮我开发一个扫雷游戏"
        )

        self.assertIn("[From AI初老师]", message)
        self.assertIn("To: 小六", message)
        self.assertIn("请帮我开发一个扫雷游戏", message)

    def test_parse_bot_response(self):
        """测试解析机器人响应"""
        # 成功响应
        response = {
            "success": True,
            "data": {"result": "任务完成"}
        }
        parsed = self.client.parse_response(response)
        self.assertEqual(parsed['status'], "success")
        self.assertEqual(parsed['message'], "任务完成")

        # 失败响应
        response = {
            "success": False,
            "error": "处理失败"
        }
        parsed = self.client.parse_response(response)
        self.assertEqual(parsed['status'], "error")
        self.assertEqual(parsed['message'], "处理失败")


if __name__ == "__main__":
    unittest.main()