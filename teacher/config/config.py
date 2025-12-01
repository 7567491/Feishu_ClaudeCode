#!/usr/bin/env python3
"""
AI初老师配置文件
"""

import os
from typing import Dict, Any

class Config:
    """配置类"""

    # 飞书应用配置
    FEISHU_APP_ID = os.getenv("FeishuT_App_ID", "")
    FEISHU_APP_SECRET = os.getenv("FeishuT_App_Secret", "")

    # AI初老师群组
    DEFAULT_GROUP_ID = os.getenv("TEACHER_GROUP_ID", "oc_15a90daa813d981076ffa50c0de0b5e4")

    # 小六服务配置
    XIAOLIU_API_URL = os.getenv("XIAOLIU_API_URL", "http://localhost:3011/api/feishu-proxy/query")
    XIAOLIU_API_KEY = os.getenv("XIAOLIU_API_KEY", "")

    # 服务器配置
    WEBHOOK_PORT = int(os.getenv("TEACHER_WEBHOOK_PORT", "33301"))
    WEBHOOK_PATH = os.getenv("TEACHER_WEBHOOK_PATH", "/webhook/feishu")

    # 日志配置
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = os.getenv("LOG_FILE", "teacher.log")

    # 开发配置
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    ENABLE_TDD = True  # 始终启用TDD模式
    ENABLE_ULTRATHINK = True  # 启用深度思考

    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """
        转换为字典

        Returns:
            配置字典
        """
        return {
            "feishu_app_id": cls.FEISHU_APP_ID,
            "default_group_id": cls.DEFAULT_GROUP_ID,
            "xiaoliu_api_url": cls.XIAOLIU_API_URL,
            "webhook_port": cls.WEBHOOK_PORT,
            "webhook_path": cls.WEBHOOK_PATH,
            "debug": cls.DEBUG,
            "enable_tdd": cls.ENABLE_TDD,
            "enable_ultrathink": cls.ENABLE_ULTRATHINK
        }

    @classmethod
    def validate(cls) -> bool:
        """
        验证配置是否完整

        Returns:
            是否有效
        """
        if not cls.FEISHU_APP_ID or not cls.FEISHU_APP_SECRET:
            print("❌ 错误：未配置飞书应用凭据")
            print("请设置环境变量：")
            print("  export FeishuT_App_ID='your_app_id'")
            print("  export FeishuT_App_Secret='your_app_secret'")
            return False

        return True