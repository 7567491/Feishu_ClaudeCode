#!/usr/bin/env python3
"""
重现问题：AI初老师只回复短句
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.session_manager import SessionManager
from lib.ai_teacher_handler import AITeacherHandler


def test_scenario_1():
    """场景1：会话已存在但状态错误"""
    print("\n=== 场景1：会话已存在但状态错误 ===")
    handler = AITeacherHandler()

    # 手动创建会话，但状态不是waiting_choice
    handler.session_manager.create_session("user1", "用户1")
    handler.session_manager.set_state("user1", "processing")  # 错误的状态

    # 发送消息
    reply = handler.handle_message("user1", "用户1", "你好", "chat1")
    print(f"回复: {reply}")

    # 如果只返回短句，说明问题重现
    if reply == "请先选择一个应用（输入两位数字，如：11、22、33）":
        print("✗ 问题重现！只返回了短句")
        return True
    else:
        print("✓ 返回了完整菜单")
        return False


def test_scenario_2():
    """场景2：会话存在但消息计数不匹配"""
    print("\n=== 场景2：会话存在但消息计数不匹配 ===")
    handler = AITeacherHandler()

    # 创建会话并手动设置消息计数
    handler.session_manager.create_session("user2", "用户2")
    handler.session_manager.sessions["user2"]["message_count"] = 5  # 非首次消息
    handler.session_manager.set_state("user2", "menu")  # 状态为menu

    # 发送消息
    reply = handler.handle_message("user2", "用户2", "你好", "chat2")
    print(f"回复: {reply}")

    if reply == "请先选择一个应用（输入两位数字，如：11、22、33）":
        print("✗ 问题重现！只返回了短句")
        return True
    else:
        print("✓ 返回了正确内容")
        return False


def test_scenario_3():
    """场景3：服务重启后会话丢失"""
    print("\n=== 场景3：服务重启后会话丢失 ===")

    # 第一个handler实例（模拟原服务）
    handler1 = AITeacherHandler()
    reply1 = handler1.handle_message("user3", "用户3", "你好", "chat3")
    print(f"第一次消息回复: {reply1[:50]}...")

    # 第二个handler实例（模拟重启后的服务）
    handler2 = AITeacherHandler()  # 新实例，会话丢失
    reply2 = handler2.handle_message("user3", "用户3", "11", "chat3")
    print(f"第二次消息回复: {reply2[:100]}...")

    # 检查是否正确处理了选择
    if "扫雷" in reply2 or "开发" in reply2:
        print("✓ 正确处理了选择")
        return False
    else:
        print("✗ 可能没有正确处理选择")
        return True


def test_scenario_4():
    """场景4：状态不一致问题"""
    print("\n=== 场景4：状态不一致问题 ===")
    handler = AITeacherHandler()

    # 正常流程
    reply1 = handler.handle_message("user4", "用户4", "你好", "chat4")
    print(f"第一次消息: 菜单显示正常")

    # 检查状态
    session = handler.session_manager.get_session("user4")
    print(f"当前状态: {session['state']}")
    print(f"消息计数: {session['message_count']}")

    # 手动破坏状态
    handler.session_manager.sessions["user4"]["state"] = "unknown"

    # 再次发送消息
    reply2 = handler.handle_message("user4", "用户4", "11", "chat4")
    print(f"第二次消息回复: {reply2}")

    if reply2 == "请先选择一个应用（输入两位数字，如：11、22、33）":
        print("✗ 问题重现！状态错误导致只返回短句")
        return True
    else:
        print("✓ 即使状态错误也能处理")
        return False


def main():
    """运行所有测试场景"""
    issues = []

    if test_scenario_1():
        issues.append("场景1：状态错误")

    if test_scenario_2():
        issues.append("场景2：消息计数不匹配")

    if test_scenario_3():
        issues.append("场景3：会话丢失")

    if test_scenario_4():
        issues.append("场景4：状态不一致")

    print("\n=== 测试结果总结 ===")
    if issues:
        print(f"发现问题：")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("未能重现问题，可能需要更多信息")

    return len(issues)


if __name__ == "__main__":
    exit(main())