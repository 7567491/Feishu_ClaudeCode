#!/usr/bin/env python3
"""
测试"AI之初"群组
"""
import sys
import os

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from lib.feishu_client import FeishuClient

# 配置
APP_ID = os.getenv("Feishu_Teacher_App_ID")
APP_SECRET = os.getenv("Feishu_Teacher_App_Secret")

# AI之初群组ID（根据用户回复"是"确认）
AI_CHU_GROUP = "oc_b65746dca5fa801872449be1e3f87250"

# 创建客户端
client = FeishuClient(APP_ID, APP_SECRET)

# 测试消息
test_message = """✅ AI初老师已成功连接到"AI之初"群组！

现在您可以通过 @AI初老师 或 @初老师 来使用我的服务。

请测试一下，发送：@初老师 你好

我将为您展示应用菜单，您可以选择想要创建的应用类型。"""

print("=" * 60)
print("向'AI之初'群组发送确认消息...")
print(f"群组ID: {AI_CHU_GROUP}")
print("=" * 60)

try:
    result = client.send_text_message(AI_CHU_GROUP, test_message)
    if result:
        print("✅ 消息发送成功！")
        print("\n请在群聊中测试 @初老师 你好")
    else:
        print("❌ 消息发送失败")
except Exception as e:
    print(f"❌ 发送异常: {e}")

print("=" * 60)