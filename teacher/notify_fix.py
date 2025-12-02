#!/usr/bin/env python3
"""
通知修复完成
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

# AI之初群组ID
AI_CHU_GROUP = "oc_b65746dca5fa801872449be1e3f87250"

# 创建客户端
client = FeishuClient(APP_ID, APP_SECRET)

# 通知消息
fix_message = """🔧 问题已修复！

刚才的选项识别问题已经解决。现在我能正确识别以下格式的输入：
✅ "11"
✅ "11 @AI初老师"
✅ "33 @初老师"
✅ "22 其他文字"

请重新尝试选择应用，例如：
- 回复 "11" 选择扫雷
- 回复 "33" 选择简易日历
- 或任意其他选项（11-33）

注意：直接回复数字即可，@提及是可选的。"""

print("发送修复通知到'AI之初'群组...")

try:
    result = client.send_text_message(AI_CHU_GROUP, fix_message)
    if result:
        print("✅ 通知发送成功！")
    else:
        print("❌ 通知发送失败")
except Exception as e:
    print(f"❌ 发送异常: {e}")