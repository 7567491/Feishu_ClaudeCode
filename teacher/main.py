#!/usr/bin/env python3
"""
AI初老师主程序
智能开发助手机器人
"""

import sys
import os
import logging
import asyncio
from flask import Flask, request, jsonify
import threading

# 添加lib目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from lib.feishu_client import FeishuClient
from lib.message_handler import MessageHandler

# 配置日志
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(Config.LOG_FILE) if Config.LOG_FILE else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)

# 全局变量
feishu_client = None
message_handler = None

def initialize():
    """初始化服务"""
    global feishu_client, message_handler

    # 验证配置
    if not Config.validate():
        sys.exit(1)

    # 创建飞书客户端
    feishu_client = FeishuClient(Config.FEISHU_APP_ID, Config.FEISHU_APP_SECRET)

    # 创建消息处理器
    message_handler = MessageHandler(feishu_client)

    logger.info("AI初老师服务初始化完成")
    logger.info(f"配置信息：{Config.to_dict()}")

    # 发送启动通知
    try:
        feishu_client.send_text_message(
            Config.DEFAULT_GROUP_ID,
            "🎉 AI初老师已上线！我是您的智能开发助手，随时为您提供开发支持。\n输入「帮助」查看可用服务。"
        )
    except Exception as e:
        logger.error(f"Failed to send startup notification: {e}")

@app.route(Config.WEBHOOK_PATH, methods=['POST'])
def webhook():
    """飞书Webhook处理"""
    try:
        data = request.json
        logger.debug(f"Received webhook data: {data}")

        # 处理URL验证
        if data.get("type") == "url_verification":
            return jsonify({"challenge": data.get("challenge")})

        # 处理事件
        if data.get("type") == "event_callback":
            event = data.get("event", {})
            event_type = event.get("type")

            # 处理消息事件
            if event_type == "message":
                message = event.get("message", {})
                content = message.get("content", "")
                chat_id = message.get("chat_id")

                if content and chat_id:
                    # 异步处理消息
                    threading.Thread(
                        target=message_handler.handle_message,
                        args=(content, chat_id)
                    ).start()

                return jsonify({"status": "ok"})

            # 处理卡片回调
            elif event_type == "card.action.trigger":
                action_data = event.get("action", {})
                open_id = event.get("open_id")

                if action_data and open_id:
                    threading.Thread(
                        target=message_handler.handle_callback,
                        args=(action_data, open_id)
                    ).start()

                return jsonify({"status": "ok"})

        return jsonify({"status": "ok"})

    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """健康检查接口"""
    return jsonify({
        "status": "healthy",
        "service": "AI初老师",
        "version": "1.0.0"
    })

@app.route('/api/send', methods=['POST'])
def api_send():
    """
    API发送消息接口
    允许其他服务调用AI初老师
    """
    try:
        data = request.json
        message = data.get("message")
        chat_id = data.get("chatId", Config.DEFAULT_GROUP_ID)

        if not message:
            return jsonify({"success": False, "error": "Missing message"}), 400

        # 处理消息
        success = message_handler.handle_message(message, chat_id)

        return jsonify({"success": success})

    except Exception as e:
        logger.error(f"API send error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def run_tests():
    """运行测试"""
    logger.info("Running tests...")

    # 测试飞书客户端
    test_message = "🧪 测试消息：AI初老师服务正常"
    try:
        success = feishu_client.send_text_message(Config.DEFAULT_GROUP_ID, test_message)
        if success:
            logger.info("✅ Feishu client test passed")
        else:
            logger.error("❌ Feishu client test failed")
    except Exception as e:
        logger.error(f"❌ Feishu client test error: {e}")

    # 测试小六API连接
    try:
        result = feishu_client.call_xiaoliu_api(
            "测试连接",
            Config.DEFAULT_GROUP_ID,
            "AI初老师"
        )
        if result.get("success"):
            logger.info("✅ Xiaoliu API test passed")
        else:
            logger.error(f"❌ Xiaoliu API test failed: {result.get('error')}")
    except Exception as e:
        logger.error(f"❌ Xiaoliu API test error: {e}")

def main():
    """主函数"""
    # 初始化
    initialize()

    # 如果是测试模式
    if "--test" in sys.argv:
        run_tests()
        return

    # 启动Web服务
    logger.info(f"Starting webhook server on port {Config.WEBHOOK_PORT}...")
    app.run(
        host='0.0.0.0',
        port=Config.WEBHOOK_PORT,
        debug=Config.DEBUG
    )

if __name__ == "__main__":
    main()