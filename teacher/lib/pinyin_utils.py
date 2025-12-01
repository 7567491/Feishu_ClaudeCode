#!/usr/bin/env python3
"""
拼音转换工具
"""
import re
from pypinyin import lazy_pinyin, Style


class PinyinConverter:
    """拼音转换器"""

    @staticmethod
    def convert(text):
        """
        将中文文本转换为拼音（无声调）

        Args:
            text: 输入文本

        Returns:
            转换后的拼音字符串
        """
        if not text:
            return ""

        if isinstance(text, str):
            # 保留英文字母和数字，过滤特殊字符
            # 先将中文转为拼音占位符，避免被过滤
            result = []
            for char in text:
                if '\u4e00' <= char <= '\u9fff':
                    # 中文字符转拼音
                    pinyin = ''.join(lazy_pinyin(char, style=Style.NORMAL))
                    result.append(pinyin)
                elif char.isalnum() or char == '_':
                    # 保留字母、数字和下划线
                    result.append(char)
                # 其他字符忽略（包括空格、特殊符号等）

            return ''.join(result)

        return ""