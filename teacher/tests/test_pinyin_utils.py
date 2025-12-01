#!/usr/bin/env python3
"""
拼音转换工具测试用例
"""
import unittest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.pinyin_utils import PinyinConverter


class TestPinyinConverter(unittest.TestCase):
    """拼音转换测试"""

    def setUp(self):
        """测试初始化"""
        self.converter = PinyinConverter()

    def test_simple_chinese_to_pinyin(self):
        """测试简单中文转拼音"""
        self.assertEqual(self.converter.convert("张三"), "zhangsan")
        self.assertEqual(self.converter.convert("李四"), "lisi")
        self.assertEqual(self.converter.convert("王五"), "wangwu")

    def test_mixed_text(self):
        """测试混合文本（中文+英文+数字）"""
        self.assertEqual(self.converter.convert("USER_03C8"), "USER_03C8")
        self.assertEqual(self.converter.convert("张三123"), "zhangsan123")
        self.assertEqual(self.converter.convert("Test测试"), "Testceshi")

    def test_empty_string(self):
        """测试空字符串"""
        self.assertEqual(self.converter.convert(""), "")
        self.assertEqual(self.converter.convert(None), "")

    def test_special_characters(self):
        """测试特殊字符"""
        self.assertEqual(self.converter.convert("张三@#$"), "zhangsan")
        self.assertEqual(self.converter.convert("李-四"), "lisi")

    def test_application_names(self):
        """测试应用名称转换"""
        self.assertEqual(self.converter.convert("扫雷"), "saolei")
        self.assertEqual(self.converter.convert("贪吃蛇"), "tanchishe")
        self.assertEqual(self.converter.convert("五子棋"), "wuziqi")
        self.assertEqual(self.converter.convert("计算器"), "jisuanqi")
        self.assertEqual(self.converter.convert("绘画板"), "huihuaban")
        self.assertEqual(self.converter.convert("倒计时器"), "daojishiqi")


if __name__ == "__main__":
    unittest.main()