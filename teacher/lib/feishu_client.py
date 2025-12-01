#!/usr/bin/env python3
"""
AI初老师飞书客户端
负责与飞书API交互和调用小六服务
"""

import requests
import json
import time
import logging
from typing import Dict, Any, Optional

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FeishuClient:
    """飞书客户端类"""

    def __init__(self, app_id: str, app_secret: str):
        """
        初始化飞书客户端

        Args:
            app_id: 飞书应用ID
            app_secret: 飞书应用密钥
        """
        self.app_id = app_id
        self.app_secret = app_secret
        self.access_token = None
        self.token_expire_time = 0

        # API endpoints
        self.auth_url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        self.message_url = "https://open.feishu.cn/open-apis/im/v1/messages"
        self.xiaoliu_api_url = "http://localhost:3011/api/feishu-proxy/query"  # 小六API地址

    def get_access_token(self) -> str:
        """
        获取飞书访问令牌

        Returns:
            访问令牌字符串
        """
        # 检查token是否过期
        if self.access_token and time.time() < self.token_expire_time:
            return self.access_token

        try:
            # 请求新token
            response = requests.post(
                self.auth_url,
                json={
                    "app_id": self.app_id,
                    "app_secret": self.app_secret
                }
            )

            data = response.json()

            if data.get("code") == 0:
                self.access_token = data.get("tenant_access_token")
                # Token通常2小时过期，这里设置为1.5小时
                self.token_expire_time = time.time() + 5400
                logger.info("Successfully obtained Feishu access token")
                return self.access_token
            else:
                logger.error(f"Failed to get access token: {data}")
                raise Exception(f"Failed to get access token: {data.get('msg')}")

        except Exception as e:
            logger.error(f"Error getting access token: {str(e)}")
            raise

    def send_text_message(self, chat_id: str, content: str) -> bool:
        """
        发送文本消息到飞书群组或用户

        Args:
            chat_id: 群组ID或用户open_id
            content: 消息内容

        Returns:
            是否发送成功
        """
        try:
            # 如果没有token才获取
            if not self.access_token:
                token = self.get_access_token()
            else:
                token = self.access_token

            # 确定接收者类型
            receive_id_type = "chat_id" if chat_id.startswith("oc_") else "open_id"

            response = requests.post(
                f"{self.message_url}?receive_id_type={receive_id_type}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={
                    "receive_id": chat_id,
                    "msg_type": "text",
                    "content": json.dumps({"text": content})
                }
            )

            data = response.json()

            if data.get("code") == 0:
                logger.info(f"Message sent successfully to {chat_id}")
                return True
            else:
                logger.error(f"Failed to send message: {data}")
                return False

        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            return False

    def send_card_message(self, chat_id: str, card: Dict[str, Any]) -> bool:
        """
        发送卡片消息到飞书群组或用户

        Args:
            chat_id: 群组ID或用户open_id
            card: 卡片内容字典

        Returns:
            是否发送成功
        """
        try:
            # 如果没有token才获取
            if not self.access_token:
                token = self.get_access_token()
            else:
                token = self.access_token

            # 确定接收者类型
            receive_id_type = "chat_id" if chat_id.startswith("oc_") else "open_id"

            response = requests.post(
                f"{self.message_url}?receive_id_type={receive_id_type}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={
                    "receive_id": chat_id,
                    "msg_type": "interactive",
                    "content": json.dumps(card)
                }
            )

            data = response.json()

            if data.get("code") == 0:
                logger.info(f"Card message sent successfully to {chat_id}")
                return True
            else:
                logger.error(f"Failed to send card message: {data}")
                return False

        except Exception as e:
            logger.error(f"Error sending card message: {str(e)}")
            return False

    def call_xiaoliu_api(self, message: str, chat_id: str, from_bot: str = "AI初老师", api_key: Optional[str] = None) -> Dict[str, Any]:
        """
        调用小六API处理任务

        Args:
            message: 要处理的消息内容
            chat_id: 飞书群组ID或用户open_id
            from_bot: 调用方机器人名称
            api_key: API密钥（可选）

        Returns:
            API响应字典
        """
        try:
            # 构建请求数据
            payload = {
                "message": message,
                "chatId": chat_id,
                "fromBot": from_bot
            }

            # 如果提供了API密钥，添加到请求中
            if api_key:
                payload["apiKey"] = api_key

            logger.info(f"Calling Xiaoliu API with message: {message[:100]}...")

            # 调用API
            response = requests.post(
                self.xiaoliu_api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30  # 30秒超时
            )

            # 检查响应状态
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Xiaoliu API response: {data}")
                return data
            else:
                logger.error(f"Xiaoliu API error: {response.status_code} - {response.text}")
                return {
                    "success": False,
                    "error": f"API returned status code {response.status_code}"
                }

        except requests.exceptions.Timeout:
            logger.error("Xiaoliu API timeout")
            return {
                "success": False,
                "error": "API request timeout"
            }
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error calling Xiaoliu API: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error calling Xiaoliu API: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    def send_file(self, chat_id: str, file_path: str, file_type: str = "file") -> bool:
        """
        发送文件到飞书群组或用户

        Args:
            chat_id: 群组ID或用户open_id
            file_path: 文件路径
            file_type: 文件类型 (file/image/audio/video)

        Returns:
            是否发送成功
        """
        try:
            token = self.get_access_token()

            # 先上传文件
            with open(file_path, 'rb') as f:
                upload_response = requests.post(
                    f"https://open.feishu.cn/open-apis/im/v1/files",
                    headers={"Authorization": f"Bearer {token}"},
                    files={"file": f},
                    data={"file_type": file_type}
                )

            upload_data = upload_response.json()

            if upload_data.get("code") != 0:
                logger.error(f"Failed to upload file: {upload_data}")
                return False

            file_key = upload_data.get("data", {}).get("file_key")

            # 发送文件消息
            receive_id_type = "chat_id" if chat_id.startswith("oc_") else "open_id"

            response = requests.post(
                f"{self.message_url}?receive_id_type={receive_id_type}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={
                    "receive_id": chat_id,
                    "msg_type": file_type,
                    "content": json.dumps({"file_key": file_key})
                }
            )

            data = response.json()

            if data.get("code") == 0:
                logger.info(f"File sent successfully to {chat_id}")
                return True
            else:
                logger.error(f"Failed to send file: {data}")
                return False

        except Exception as e:
            logger.error(f"Error sending file: {str(e)}")
            return False