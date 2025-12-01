#!/usr/bin/env python3
"""
AI初老师主程序
基于chu.md规则的智能开发助手
"""
import sys
import os
import logging
from flask import Flask, request, jsonify

# 添加lib目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from lib.feishu_client import FeishuClient
from lib.ai_teacher_handler import AITeacherHandler

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
ai_teacher = None


def initialize():
    """初始化服务"""
    global feishu_client, ai_teacher

    # 验证配置
    if not Config.validate():
        logger.error("Configuration validation failed")
        sys.exit(1)

    # 创建飞书客户端
    feishu_client = FeishuClient(Config.FEISHU_APP_ID, Config.FEISHU_APP_SECRET)

    # 创建AI初老师处理器
    ai_teacher = AITeacherHandler(feishu_client)

    logger.info("AI初老师服务初始化完成")
    logger.info(f"配置信息：{Config.to_dict()}")

    # 发送启动通知
    try:
        feishu_client.send_text_message(
            Config.DEFAULT_GROUP_ID,
            "🎉 AI初老师已上线！我是您的智能开发助手，随时为您一键生成云上应用。"
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

            # 处理接收消息事件
            if event_type == "im.message.receive_v1":
                message_data = event.get("message", {})
                content = message_data.get("content", "")
                chat_id = message_data.get("chat_id")

                # 解析消息内容（假设是文本消息）
                import json as json_lib
                try:
                    content_json = json_lib.loads(content)
                    text_content = content_json.get("text", "")
                except:
                    text_content = content

                # 获取发送者信息
                sender = event.get("sender", {})
                user_id = sender.get("sender_id", {}).get("open_id", "")

                # 尝试获取用户昵称（可能需要调用API获取）
                user_nickname = user_id  # 默认使用ID作为昵称
                try:
                    # 这里应该调用飞书API获取用户信息
                    # user_info = feishu_client.get_user_info(user_id)
                    # user_nickname = user_info.get("name", user_id)
                    pass
                except:
                    pass

                if text_content and chat_id and user_id:
                    # 处理消息
                    reply = ai_teacher.handle_message(
                        user_id=user_id,
                        user_nickname=user_nickname,
                        message=text_content,
                        chat_id=chat_id
                    )

                    # 发送回复
                    try:
                        feishu_client.send_text_message(chat_id, reply)
                    except Exception as e:
                        logger.error(f"Failed to send reply: {e}")

                return jsonify({"status": "ok"})

        return jsonify({"status": "ok"})

    except Exception as e:
        logger.error(f"Webhook error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        "status": "healthy",
        "service": "AI Teacher",
        "version": "2.0"
    })


@app.route('/reset/<user_id>', methods=['POST'])
def reset_session(user_id):
    """重置用户会话（用于测试）"""
    if Config.DEBUG:
        success = ai_teacher.reset_session(user_id)
        return jsonify({"success": success})
    return jsonify({"error": "Debug mode required"}), 403


if __name__ == "__main__":
    # 初始化服务
    initialize()

    # 启动Flask应用
    logger.info(f"Starting webhook server on port {Config.WEBHOOK_PORT}...")
    app.run(
        host='0.0.0.0',
        port=Config.WEBHOOK_PORT,
        debug=Config.DEBUG
    )