#!/usr/bin/env python3
"""
AI初老师Webhook测试脚本
用于验证webhook配置和消息处理
"""

import requests
import json
import time
import sys
import os

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'))

# 测试配置
WEBHOOK_URL = "http://localhost:33301/webhook/feishu"
TEST_CHAT_ID = "oc_b65746dca5fa801872449be1e3f87250"  # 测试群组
TEST_USER_ID = "ou_test_user_001"

def test_url_verification():
    """测试URL验证"""
    print("=" * 50)
    print("测试 1: URL验证")
    print("-" * 50)

    data = {
        "type": "url_verification",
        "challenge": "test-challenge-123456"
    }

    try:
        response = requests.post(WEBHOOK_URL, json=data)
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")

        if response.json().get("challenge") == data["challenge"]:
            print("✅ URL验证测试通过")
            return True
        else:
            print("❌ URL验证测试失败：challenge不匹配")
            return False
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False

def test_message_event():
    """测试消息事件处理"""
    print("\n" + "=" * 50)
    print("测试 2: 消息事件处理")
    print("-" * 50)

    # 模拟@AI初老师的消息
    data = {
        "type": "event_callback",
        "event": {
            "type": "im.message.receive_v1",
            "message": {
                "message_type": "text",
                "content": json.dumps({"text": "@AI初老师 你好，请介绍一下自己"}),
                "chat_id": TEST_CHAT_ID,
                "message_id": f"msg_test_{int(time.time())}"
            },
            "sender": {
                "sender_id": {
                    "open_id": TEST_USER_ID,
                    "user_id": "test_user"
                },
                "sender_type": "user"
            }
        }
    }

    try:
        response = requests.post(WEBHOOK_URL, json=data)
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")

        if response.status_code == 200:
            print("✅ 消息事件测试通过")
            return True
        else:
            print("❌ 消息事件测试失败")
            return False
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False

def test_health_check():
    """测试健康检查"""
    print("\n" + "=" * 50)
    print("测试 3: 健康检查")
    print("-" * 50)

    health_url = "http://localhost:33301/health"

    try:
        response = requests.get(health_url)
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")

        if response.json().get("status") == "healthy":
            print("✅ 健康检查测试通过")
            return True
        else:
            print("❌ 健康检查测试失败")
            return False
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False

def test_feishu_api():
    """测试飞书API配置"""
    print("\n" + "=" * 50)
    print("测试 4: 飞书API配置验证")
    print("-" * 50)

    # 检查环境变量
    app_id = os.getenv("Feishu_Teacher_App_ID")
    app_secret = os.getenv("Feishu_Teacher_App_Secret")

    print(f"App ID: {app_id}")
    print(f"App Secret: {'*' * 10 if app_secret else 'Not Set'}")

    if not app_id or not app_secret:
        print("❌ 飞书凭证未配置")
        return False

    # 测试获取access token
    token_url = "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal"

    data = {
        "app_id": app_id,
        "app_secret": app_secret
    }

    try:
        response = requests.post(token_url, json=data)
        result = response.json()

        if result.get("code") == 0:
            print(f"✅ Access Token获取成功")
            print(f"   Token: {result.get('app_access_token')[:20]}...")
            print(f"   过期时间: {result.get('expire')} 秒")
            return True
        else:
            print(f"❌ Access Token获取失败: {result.get('msg')}")
            return False
    except Exception as e:
        print(f"❌ API请求失败: {e}")
        return False

def main():
    """运行所有测试"""
    print("\n" + "🚀" * 25)
    print("AI初老师Webhook配置测试")
    print("🚀" * 25)

    results = []

    # 运行测试
    results.append(("健康检查", test_health_check()))
    results.append(("URL验证", test_url_verification()))
    results.append(("消息处理", test_message_event()))
    results.append(("飞书API", test_feishu_api()))

    # 输出总结
    print("\n" + "=" * 50)
    print("测试结果总结")
    print("=" * 50)

    passed = 0
    failed = 0

    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1

    print("-" * 50)
    print(f"总计: {passed} 通过, {failed} 失败")

    if failed == 0:
        print("\n🎉 所有测试通过！服务配置正确。")
        print("\n⚠️ 注意：还需要在飞书开放平台完成以下配置：")
        print("1. 登录 https://open.feishu.cn/app/cli_a9ad59fd26389cee")
        print("2. 进入'事件订阅'页面")
        print("3. 配置请求地址URL: http://你的服务器IP:33301/webhook/feishu")
        print("4. 添加事件：接收消息 im.message.receive_v1")
        print("5. 将机器人添加到目标群组")
    else:
        print(f"\n❌ 有 {failed} 个测试失败，请检查配置。")

    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)