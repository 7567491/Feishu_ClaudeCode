#!/usr/bin/env python3
"""
测试选项解析功能
"""
import sys
import os

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.menu_manager import MenuManager

# 测试用例
test_cases = [
    # (输入, 期望输出)
    ("11", 11),                     # 纯数字
    ("11 @AI初老师", 11),            # 带@提及
    ("33 @初老师", 33),              # 带@提及（33选项）
    ("22", 22),                     # 纯数字（22选项）
    ("11@AI初老师", 11),             # 直接连接
    (" 12 ", 12),                   # 前后有空格
    ("13 你好", 13),                 # 带其他文字
    ("21", 21),                     # 前端应用
    ("31", 31),                     # 全栈应用
    ("99", None),                   # 无效选项
    ("abc", None),                  # 非数字
    ("1", None),                    # 位数不足
    ("", None),                     # 空字符串
    ("@AI初老师", None),             # 只有@提及
]

def run_tests():
    """运行测试"""
    menu_manager = MenuManager()

    print("=" * 60)
    print("测试选项解析功能")
    print("=" * 60)

    passed = 0
    failed = 0

    for test_input, expected in test_cases:
        result = menu_manager.parse_choice(test_input)

        if result == expected:
            status = "✅"
            passed += 1
        else:
            status = "❌"
            failed += 1

        print(f"{status} 输入: '{test_input}' -> 期望: {expected}, 实际: {result}")

        if result and result in menu_manager.apps:
            app_info = menu_manager.apps[result]
            print(f"   -> 应用: {app_info['name']} ({app_info['category']})")

    print("=" * 60)
    print(f"测试结果: {passed} 通过, {failed} 失败")

    if failed == 0:
        print("✅ 所有测试通过！选项解析功能正常。")
    else:
        print(f"❌ 有 {failed} 个测试失败，需要进一步调试。")

    return failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)