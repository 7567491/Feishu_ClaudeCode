#!/usr/bin/env python3
"""
AI初老师飞书客户端测试用例
TDD开发方式 - 先写测试，后写实现
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.feishu_client import FeishuClient

class TestFeishuClient(unittest.TestCase):
    """测试飞书客户端类"""

    def setUp(self):
        """测试前准备"""
        self.app_id = "test_app_id"
        self.app_secret = "test_app_secret"
        self.client = FeishuClient(self.app_id, self.app_secret)

    def test_init(self):
        """测试初始化"""
        self.assertEqual(self.client.app_id, self.app_id)
        self.assertEqual(self.client.app_secret, self.app_secret)
        self.assertIsNone(self.client.access_token)

    @patch('requests.post')
    def test_get_access_token(self, mock_post):
        """测试获取访问令牌"""
        # 模拟API响应
        mock_response = Mock()
        mock_response.json.return_value = {
            "code": 0,
            "msg": "success",
            "tenant_access_token": "test_token_123"
        }
        mock_post.return_value = mock_response

        # 获取token
        token = self.client.get_access_token()

        # 验证
        self.assertEqual(token, "test_token_123")
        self.assertEqual(self.client.access_token, "test_token_123")
        mock_post.assert_called_once()

    @patch('requests.post')
    def test_send_text_message(self, mock_post):
        """测试发送文本消息"""
        # 设置token
        self.client.access_token = "test_token"

        # 模拟API响应
        mock_response = Mock()
        mock_response.json.return_value = {
            "code": 0,
            "msg": "success",
            "data": {"message_id": "msg_123"}
        }
        mock_post.return_value = mock_response

        # 发送消息
        result = self.client.send_text_message("oc_test_group", "测试消息")

        # 验证
        self.assertTrue(result)
        mock_post.assert_called_once()

        # 验证请求参数
        call_args = mock_post.call_args
        self.assertIn("oc_test_group", str(call_args))

    @patch('requests.post')
    def test_send_card_message(self, mock_post):
        """测试发送卡片消息"""
        self.client.access_token = "test_token"

        # 模拟API响应
        mock_response = Mock()
        mock_response.json.return_value = {
            "code": 0,
            "msg": "success",
            "data": {"message_id": "msg_456"}
        }
        mock_post.return_value = mock_response

        # 卡片内容
        card = {
            "config": {"wide_screen_mode": True},
            "elements": [{"tag": "div", "text": {"content": "测试卡片"}}]
        }

        # 发送卡片
        result = self.client.send_card_message("oc_test_group", card)

        # 验证
        self.assertTrue(result)
        mock_post.assert_called_once()

    @patch('requests.post')
    def test_call_xiaoliu_api(self, mock_post):
        """测试调用小六API"""
        # 模拟API响应
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": True,
            "message": "Query accepted",
            "sessionId": "session_123"
        }
        mock_post.return_value = mock_response

        # 调用API
        result = self.client.call_xiaoliu_api(
            message="开发一个计算器",
            chat_id="oc_test_group",
            from_bot="AI初老师"
        )

        # 验证
        self.assertTrue(result['success'])
        self.assertEqual(result['sessionId'], "session_123")
        mock_post.assert_called_once()

        # 验证请求参数
        call_args = mock_post.call_args
        json_data = call_args[1]['json']
        self.assertEqual(json_data['message'], "开发一个计算器")
        self.assertEqual(json_data['chatId'], "oc_test_group")
        self.assertEqual(json_data['fromBot'], "AI初老师")

    @patch('requests.post')
    def test_handle_api_error(self, mock_post):
        """测试API错误处理"""
        # 模拟API错误
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        # 调用应该处理错误
        result = self.client.call_xiaoliu_api("test", "oc_test", "bot")

        # 验证错误处理
        self.assertFalse(result.get('success', False))

if __name__ == '__main__':
    unittest.main()