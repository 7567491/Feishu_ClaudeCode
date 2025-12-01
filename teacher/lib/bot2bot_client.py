#!/usr/bin/env python3
"""
Bot-to-Bot通信客户端
"""
import requests
import json
import logging
import os
from typing import Dict, Optional


logger = logging.getLogger(__name__)


class Bot2BotClient:
    """Bot-to-Bot通信客户端"""

    def __init__(self, api_url: Optional[str] = None):
        """
        初始化Bot-to-Bot客户端

        Args:
            api_url: 小六API地址
        """
        self.api_url = api_url or os.getenv(
            "XIAOLIU_API_URL",
            "http://localhost:33300/api/feishu-proxy/query"
        )
        self.api_key = os.getenv("XIAOLIU_API_KEY")
        self.timeout = 30

    def send_to_xiaoliu(
        self,
        prompt: str,
        user_id: str,
        chat_id: str,
        from_bot: str = "AI初老师"
    ) -> Dict:
        """
        发送任务给小六机器人

        Args:
            prompt: 任务描述
            user_id: 用户ID
            chat_id: 对话ID
            from_bot: 来源机器人名称

        Returns:
            响应结果字典
        """
        try:
            # 跳过明显的占位/测试 chat_id，避免无效 open_id 调用
            placeholder_prefixes = ("test_", "mock_", "debug_", "dev_")
            valid_prefixes = ("oc_", "ou_", "ocb_", "oci_")
            if not chat_id or chat_id.startswith(placeholder_prefixes) or (
                chat_id and not chat_id.startswith(valid_prefixes)
            ):
                logger.info(
                    "Skipping XiaoLiu call for placeholder/invalid chatId: %s", chat_id
                )
                return {
                    "success": True,
                    "data": {"result": "skipped (placeholder chat_id)"},
                    "raw": None
                }

            payload = {
                "message": prompt,
                "chatId": chat_id,
                "fromBot": from_bot
            }

            if user_id:
                payload["userId"] = user_id
            if self.api_key:
                payload["apiKey"] = self.api_key

            logger.info(f"Sending to XiaoLiu: {prompt[:100]}...")

            response = requests.post(
                self.api_url,
                json=payload,
                timeout=self.timeout,
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code == 200:
                result = response.json()
                logger.info("XiaoLiu response received successfully")
                return {
                    "success": True,
                    "data": result.get("data", result),
                    "raw": result
                }
            else:
                logger.error(f"XiaoLiu API error: {response.status_code}")
                return {
                    "success": False,
                    "error": f"API returned {response.status_code}: {response.text}"
                }

        except Exception as e:
            logger.error(f"Failed to send to XiaoLiu: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    def format_bot_message(
        self,
        from_bot: str,
        to_bot: str,
        content: str
    ) -> str:
        """
        格式化Bot-to-Bot消息

        Args:
            from_bot: 发送方机器人
            to_bot: 接收方机器人
            content: 消息内容

        Returns:
            格式化后的消息
        """
        return f"""[From {from_bot}]
To: {to_bot}
---
{content}"""

    def parse_response(self, response: Dict) -> Dict:
        """
        解析机器人响应

        Args:
            response: 原始响应

        Returns:
            解析后的结果
        """
        if response.get('success'):
            data = response.get('data', {})
            return {
                'status': 'success',
                'message': data.get('result', data.get('message', '处理成功')),
                'data': data
            }
        else:
            return {
                'status': 'error',
                'message': response.get('error', '处理失败'),
                'data': None
            }

    def check_connection(self) -> bool:
        """
        检查与小六的连接状态

        Returns:
            True if connected, False otherwise
        """
        try:
            response = requests.get(
                self.api_url.replace('/query', '/health'),
                timeout=5
            )
            return response.status_code == 200
        except:
            return False
