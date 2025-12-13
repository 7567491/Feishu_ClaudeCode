#!/usr/bin/env python3
"""
MCP 服务测试脚本
"""
import json
import subprocess
import sys

def test_list_methods():
    """测试 list_methods 方法"""
    print("\n=== 测试 1: list_methods ===")
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "list_methods",
        "params": {}
    }

    proc = subprocess.Popen(
        ['python3', 'server.py', '--stdio'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    stdout, stderr = proc.communicate(json.dumps(request) + '\n')

    if stderr:
        print(f"错误输出: {stderr}")

    try:
        response = json.loads(stdout.strip())
        print("✅ 方法列表:")
        for method in response['result']['methods']:
            print(f"  - {method['name']}: {method['description']}")
    except Exception as e:
        print(f"❌ 解析失败: {e}")
        print(f"原始输出: {stdout}")

def test_publish_markdown():
    """测试 publish_markdown 方法"""
    print("\n=== 测试 2: publish_markdown ===")

    markdown_content = """# 测试文章标题

这是一个测试文章。

## 二级标题

- 列表项 1
- 列表项 2

**粗体文本** 和 *斜体文本*
"""

    request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "publish_markdown",
        "params": {
            "content": markdown_content,
            "title": "MCP 测试文章"
        }
    }

    proc = subprocess.Popen(
        ['python3', 'server.py', '--stdio'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    stdout, stderr = proc.communicate(json.dumps(request) + '\n')

    if stderr:
        print(f"错误输出: {stderr}")

    try:
        response = json.loads(stdout.strip())
        if 'result' in response and response['result'].get('success'):
            print(f"✅ 发布成功!")
            print(f"   草稿 ID: {response['result'].get('draft_id')}")
        else:
            print(f"❌ 发布失败: {response.get('result', {}).get('message', '未知错误')}")
    except Exception as e:
        print(f"❌ 解析失败: {e}")
        print(f"原始输出: {stdout}")

def main():
    """主函数"""
    print("AutoMD MCP Server 测试工具")
    print("=" * 50)

    # 检查凭据文件
    import os
    credentials_file = os.path.expanduser('~/.automd-credentials.json')
    if not os.path.exists(credentials_file):
        print(f"\n⚠️  警告: 凭据文件不存在: {credentials_file}")
        print("请先运行: bash setup-credentials.sh")
        sys.exit(1)

    # 运行测试
    test_list_methods()

    print("\n是否要测试实际发布功能？(将创建微信草稿)")
    response = input("输入 'yes' 继续: ")

    if response.lower() == 'yes':
        test_publish_markdown()
    else:
        print("已跳过发布测试")

    print("\n测试完成!")

if __name__ == '__main__':
    main()
