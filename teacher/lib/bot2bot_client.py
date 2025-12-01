#!/usr/bin/env python3
"""
Bot-to-Bot通信客户端
"""
import requests
import json
import logging
from typing import Dict, Optional


logger = logging.getLogger(__name__)


class Bot2BotClient:
    """Bot-to-Bot通信客户端"""

    def __init__(self, api_url: str = "http://localhost:3011/api/feishu-proxy/query"):
        """
        初始化Bot-to-Bot客户端

        Args:
            api_url: 小六API地址
        """
        self.api_url = api_url
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
            payload = {
                "query": prompt,
                "fromBot": from_bot,
                "toBot": "小六",
                "userId": user_id,
                "chatId": chat_id,
                "context": {
                    "type": "task",
                    "source": "AI_Teacher"
                }
            }

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
                    "data": result
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