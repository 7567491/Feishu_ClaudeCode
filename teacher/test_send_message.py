#!/usr/bin/env python3
"""
测试主动发送消息到群组
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

# AI初老师所在的群组列表
groups = [
    "oc_b65746dca5fa801872449be1e3f87250",  # 最近活跃 (12-01 09:31)
    "oc_56626bf09f5ea12a762857e9f027dd1d",  # 11-30
    "oc_638e40584c5a2017b47b8a0914949bd1",  # 11-30
    "oc_19917e2dbb77aecef26ccd2692647913",  # 11-29
    "oc_3f1bfdd41d23072b17506b7d681f6b3b",  # 11-29
    "oc_901094f8c8b7e80a7af28e6e201876cc",  # 11-29
    "oc_6de411771b976d97e51123f80f13d8c3",  # 11-29
    "oc_eb2f5c4418fd953eb9e8c764e5e87a28",  # 11-28
    "oc_77c58572eaee9e9df38884893c9c63ec",  # 11-28
    "oc_ae2f0a2adb187ed07809d72dba37728c",  # 11-28
]

# 创建客户端
client = FeishuClient(APP_ID, APP_SECRET)

# 测试消息
test_message = """🎉 AI初老师服务已上线！

我是AI初老师，您的智能编程助手，可以帮您一键生成云上应用。

如需使用，请 @AI初老师 或 @初老师，我将为您展示应用菜单。

当前支持的应用包括：
• 前端小游戏：扫雷、贪吃蛇、五子棋
• 前端小应用：计算器、绘画板、倒计时器
• 全栈小应用：任务待办清单、简易博客、简易日历

注意：如果群名包含"AI之初"，请回复"是"，我将记录此群组。"""

print("开始向群组发送测试消息...")
print("=" * 60)

success_count = 0
fail_count = 0

for chat_id in groups:
    print(f"\n尝试发送到群组: {chat_id}")
    try:
        # 先尝试获取群组信息（可能会失败，但不影响发送）
        # 这里我们直接发送消息
        result = client.send_text_message(chat_id, test_message)
        if result:
            print(f"✅ 成功发送到: {chat_id}")
            success_count += 1
        else:
            print(f"❌ 发送失败: {chat_id}")
            fail_count += 1
    except Exception as e:
        print(f"❌ 发送异常: {chat_id} - {e}")
        fail_count += 1

print("\n" + "=" * 60)
print(f"发送完成！成功: {success_count}, 失败: {fail_count}")
print("\n如果某个群组回复包含'AI之初'，那就是目标群组。")