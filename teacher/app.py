#!/usr/bin/env python3
"""
AI初老师主程序
基于chu.md规则的智能开发助手
"""
import sys
import os
import logging
from flask import Flask, request, jsonify
from dotenv import load_dotenv

# 加载.env文件
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

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
        logger.info(f"=== Received webhook request ===")
        logger.info(f"Webhook data: {data}")
        logger.debug(f"Received webhook data: {data}")

        # 处理URL验证
        if data.get("type") == "url_verification":
            return jsonify({"challenge": data.get("challenge")})

        # 处理事件 (兼容v2.0格式)
        event_data = None
        if data.get("type") == "event_callback":
            logger.info("Processing event_callback (v1.0 format)")
            event_data = data.get("event", {})
        elif data.get("schema") == "2.0" and data.get("event"):
            logger.info("Processing event (v2.0 format)")
            event_data = data.get("event", {})

        if event_data:
            event = event_data
            # v2.0格式中，事件类型在header中
            if data.get("schema") == "2.0":
                event_type = data.get("header", {}).get("event_type")
            else:
                event_type = event.get("type")
            logger.info(f"Event type: {event_type}")

            # 处理接收消息事件
            if event_type == "im.message.receive_v1":
                logger.info("Processing message receive event")
                message_data = event.get("message", {})
                content = message_data.get("content", "")
                chat_id = message_data.get("chat_id")
                chat_type = message_data.get("chat_type")
                mentions = message_data.get("mentions") or []
                logger.info(f"Chat ID: {chat_id}, Content: {content}")

                # 解析消息内容（假设是文本消息）
                import json as json_lib
                try:
                    content_json = json_lib.loads(content)
                    text_content = content_json.get("text", "")
                except:
                    text_content = content

                # 群聊只响应被@的消息（或@全体），私聊默认响应
                if chat_type == "group":
                    bot_name = getattr(Config, "BOT_NAME", "AI初老师")
                    bot_app_id = Config.FEISHU_APP_ID
                    mentioned = False
                    for mention in mentions:
                        mention_id = mention.get("id", {})
                        mention_key = mention.get("key")
                        mention_name = mention.get("name")

                        if mention_key == "@_all":
                            mentioned = True
                            break
                        if bot_app_id and mention_id.get("app_id") == bot_app_id:
                            mentioned = True
                            break
                        if bot_name and mention_name and bot_name in mention_name:
                            mentioned = True
                            break
                    if not mentioned:
                        logger.info("Group message without mentioning AI初老师, ignore.")
                        return jsonify({"status": "ignored", "reason": "not_mentioned"})

                # 获取发送者信息
                sender = event.get("sender", {})
                sender_ids = sender.get("sender_id", {})
                user_id = sender_ids.get("open_id") or sender_ids.get("user_id") or sender_ids.get("union_id") or ""

                # 获取用户昵称（优先从群成员列表/飞书接口查询）
                user_nickname = user_id
                try:
                    user_nickname = feishu_client.get_user_nickname(user_id, chat_id)
                except Exception as e:
                    logger.warning(f"Failed to fetch user nickname, fallback to ID: {e}")

                if text_content and chat_id and user_id:
                    logger.info(f"Processing message from user {user_id}: {text_content}")
                    # 处理消息
                    reply = ai_teacher.handle_message(
                        user_id=user_id,
                        user_nickname=user_nickname,
                        message=text_content,
                        chat_id=chat_id
                    )
                    logger.info(f"Generated reply: {reply}")

                    # 发送回复
                    try:
                        feishu_client.send_text_message(chat_id, reply)
                        logger.info("Reply sent successfully")
                    except Exception as e:
                        logger.error(f"Failed to send reply: {e}")
                else:
                    logger.warning(f"Missing required fields - text: {bool(text_content)}, chat_id: {bool(chat_id)}, user_id: {bool(user_id)}")

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
