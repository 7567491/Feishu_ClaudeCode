#!/usr/bin/env python3
"""
AI初老师集成测试
验证系统整体功能
"""

import sys
import os
import json
import time

# 添加lib目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from lib.feishu_client import FeishuClient
from lib.message_handler import MessageHandler

def test_integration():
    """运行集成测试"""
    print("=" * 60)
    print("AI初老师集成测试")
    print("=" * 60)

    # 1. 初始化测试
    print("\n[测试1] 初始化组件...")
    try:
        # 使用测试凭据
        if not Config.FEISHU_APP_ID:
            print("⚠️ 跳过集成测试：未配置飞书凭据")
            print("请设置 TEACHER_FEISHU_APP_ID 和 TEACHER_FEISHU_APP_SECRET")
            return

        client = FeishuClient(Config.FEISHU_APP_ID, Config.FEISHU_APP_SECRET)
        handler = MessageHandler(client)
        print("✅ 组件初始化成功")
    except Exception as e:
        print(f"❌ 初始化失败：{e}")
        return

    # 2. 命令解析测试
    print("\n[测试2] 命令解析...")
    test_cases = [
        ("帮助", "help"),
        ("开发一个计算器", "develop"),
        ("测试用户登录", "test"),
        ("调试内存泄漏", "debug"),
        ("生成API文档", "document"),
        ("重构代码", "refactor"),
        ("分析性能", "analyze"),
        ("随机文本", "unknown")
    ]

    for message, expected_type in test_cases:
        cmd = handler.parse_command(message)
        if cmd["type"] == expected_type:
            print(f"✅ '{message}' -> {expected_type}")
        else:
            print(f"❌ '{message}' 期望 {expected_type}，得到 {cmd['type']}")

    # 3. 菜单卡片测试
    print("\n[测试3] 生成菜单卡片...")
    try:
        card = handler.create_menu_card()
        assert "header" in card
        assert "elements" in card
        assert len(card["elements"]) > 0
        print(f"✅ 菜单卡片包含 {len(card['elements'])} 个元素")
    except Exception as e:
        print(f"❌ 菜单卡片生成失败：{e}")

    # 4. 任务格式化测试
    print("\n[测试4] 任务消息格式化...")
    task_types = ["develop", "test", "debug", "document", "refactor", "analyze"]
    for task_type in task_types:
        try:
            msg = handler.format_task_message(task_type, "测试任务内容")
            assert "测试任务内容" in msg
            print(f"✅ {task_type} 任务格式化成功")
        except Exception as e:
            print(f"❌ {task_type} 任务格式化失败：{e}")

    # 5. API连接测试（可选）
    print("\n[测试5] 小六API连接...")
    try:
        # 测试API是否可达
        result = client.call_xiaoliu_api(
            message="ping",
            chat_id="test_chat",
            from_bot="AI初老师测试"
        )

        if result.get("success"):
            print(f"✅ API连接成功：{result.get('message', 'OK')}")
        else:
            print(f"⚠️ API连接失败（可能小六服务未运行）：{result.get('error')}")
    except Exception as e:
        print(f"⚠️ API连接异常（可能小六服务未运行）：{e}")

    # 6. 完整工作流测试
    print("\n[测试6] 完整工作流...")
    test_chat_id = Config.DEFAULT_GROUP_ID

    # 测试帮助命令
    print("- 测试帮助命令...")
    try:
        # 注意：这里只是测试流程，不会真正发送消息到飞书
        cmd = handler.parse_command("帮助")
        if cmd["type"] == "help":
            card = handler.create_menu_card()
            print(f"  ✅ 帮助命令处理成功")
        else:
            print(f"  ❌ 帮助命令处理失败")
    except Exception as e:
        print(f"  ❌ 帮助命令异常：{e}")

    # 测试开发任务
    print("- 测试开发任务...")
    try:
        cmd = handler.parse_command("开发登录功能")
        if cmd["type"] == "develop":
            msg = handler.format_task_message(cmd["type"], cmd["content"])
            assert "TDD" in msg
            assert "开发登录功能" in msg
            print(f"  ✅ 开发任务处理成功")
        else:
            print(f"  ❌ 开发任务处理失败")
    except Exception as e:
        print(f"  ❌ 开发任务异常：{e}")

    print("\n" + "=" * 60)
    print("集成测试完成")
    print("=" * 60)

def main():
    """主函数"""
    # 设置测试环境
    os.environ["LOG_LEVEL"] = "ERROR"  # 减少测试时的日志输出

    try:
        test_integration()
    except KeyboardInterrupt:
        print("\n测试中断")
    except Exception as e:
        print(f"\n测试异常：{e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()