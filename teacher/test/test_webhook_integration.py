#!/usr/bin/env python3
"""
AI初老师Webhook集成测试套件（TDD）
用于验证飞书webhook配置是否正确
"""

import unittest
import requests
import json
import time
import os
import sys
import logging
from datetime import datetime

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'))

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TestAITeacherWebhook(unittest.TestCase):
    """AI初老师Webhook测试类"""

    @classmethod
    def setUpClass(cls):
        """测试类初始化"""
        cls.webhook_url = "http://localhost:33301/webhook/feishu"
        cls.health_url = "http://localhost:33301/health"
        cls.app_id = os.getenv("Feishu_Teacher_App_ID")
        cls.app_secret = os.getenv("Feishu_Teacher_App_Secret")
        cls.test_chat_id = "oc_b65746dca5fa801872449be1e3f87250"

    def test_01_service_health(self):
        """测试1: 服务健康检查"""
        logger.info("测试服务健康状态...")

        response = requests.get(self.health_url)
        self.assertEqual(response.status_code, 200, "服务应返回200状态码")

        data = response.json()
        self.assertEqual(data.get("status"), "healthy", "服务状态应为healthy")
        self.assertIn("version", data, "应包含版本信息")

        logger.info(f"✅ 服务健康检查通过: {data}")

    def test_02_webhook_url_verification(self):
        """测试2: URL验证功能"""
        logger.info("测试URL验证...")

        test_challenge = f"test-challenge-{int(time.time())}"
        data = {
            "type": "url_verification",
            "challenge": test_challenge
        }

        response = requests.post(self.webhook_url, json=data)
        self.assertEqual(response.status_code, 200, "URL验证应返回200")

        result = response.json()
        self.assertEqual(result.get("challenge"), test_challenge,
                        "应返回相同的challenge")

        logger.info(f"✅ URL验证通过: challenge={test_challenge}")

    def test_03_feishu_credentials(self):
        """测试3: 飞书凭证配置"""
        logger.info("测试飞书凭证...")

        self.assertIsNotNone(self.app_id, "App ID应已配置")
        self.assertIsNotNone(self.app_secret, "App Secret应已配置")
        self.assertEqual(self.app_id, "cli_a9ad59fd26389cee",
                        "应使用AI初老师的App ID")

        logger.info(f"✅ 凭证配置正确: App ID={self.app_id}")

    def test_04_access_token_acquisition(self):
        """测试4: Access Token获取"""
        logger.info("测试Access Token获取...")

        url = "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal"
        data = {
            "app_id": self.app_id,
            "app_secret": self.app_secret
        }

        response = requests.post(url, json=data)
        result = response.json()

        self.assertEqual(result.get("code"), 0, f"API应返回成功: {result.get('msg')}")
        self.assertIn("app_access_token", result, "应包含access token")
        self.assertIn("expire", result, "应包含过期时间")

        token = result.get("app_access_token")
        logger.info(f"✅ Access Token获取成功: {token[:20]}...")

    def test_05_message_event_handling(self):
        """测试5: 消息事件处理"""
        logger.info("测试消息事件处理...")

        # 构造测试消息
        message_id = f"test_msg_{int(time.time())}"
        test_message = "@AI初老师 测试消息"

        data = {
            "type": "event_callback",
            "event": {
                "type": "im.message.receive_v1",
                "message": {
                    "message_type": "text",
                    "content": json.dumps({"text": test_message}),
                    "chat_id": self.test_chat_id,
                    "message_id": message_id
                },
                "sender": {
                    "sender_id": {
                        "open_id": "test_user_001",
                        "user_id": "test_user"
                    },
                    "sender_type": "user"
                }
            }
        }

        response = requests.post(self.webhook_url, json=data)
        self.assertEqual(response.status_code, 200, "消息处理应返回200")

        result = response.json()
        self.assertEqual(result.get("status"), "ok", "处理状态应为ok")

        logger.info(f"✅ 消息事件处理成功: message_id={message_id}")

    def test_06_webhook_connectivity(self):
        """测试6: 外网连通性"""
        logger.info("测试外网连通性...")

        external_url = "http://139.162.52.158:33301/health"

        try:
            response = requests.get(external_url, timeout=5)
            if response.status_code == 200:
                logger.info(f"✅ 外网连接成功: {external_url}")
            else:
                logger.warning(f"⚠️ 外网连接返回非200状态: {response.status_code}")
        except requests.exceptions.RequestException as e:
            logger.warning(f"⚠️ 外网连接失败（可能需要防火墙配置）: {e}")
            self.skipTest("外网连接失败，跳过此测试")

    def test_07_message_with_mentions(self):
        """测试7: 带@提及的消息处理"""
        logger.info("测试@提及处理...")

        data = {
            "type": "event_callback",
            "event": {
                "type": "im.message.receive_v1",
                "message": {
                    "message_type": "text",
                    "content": json.dumps({
                        "text": "@AI初老师 帮我创建一个网页应用"
                    }),
                    "chat_id": self.test_chat_id,
                    "message_id": f"mention_test_{int(time.time())}",
                    "mentions": [
                        {
                            "key": "@_user_1",
                            "id": {
                                "open_id": "ou_b9f158fd555843e6c68f84a2de19dc39",
                                "user_id": "ai_teacher"
                            },
                            "name": "AI初老师",
                            "tenant_key": "test_tenant"
                        }
                    ]
                },
                "sender": {
                    "sender_id": {
                        "open_id": "test_user_002",
                        "user_id": "test_user"
                    },
                    "sender_type": "user"
                }
            }
        }

        response = requests.post(self.webhook_url, json=data)
        self.assertEqual(response.status_code, 200, "带@提及的消息应正常处理")

        logger.info("✅ @提及消息处理成功")

    def test_08_error_handling(self):
        """测试8: 错误处理"""
        logger.info("测试错误处理...")

        # 发送格式错误的数据
        invalid_data = {
            "type": "invalid_type",
            "data": "invalid"
        }

        response = requests.post(self.webhook_url, json=invalid_data)
        # 应该返回200（忽略未知类型）或500（处理错误）
        self.assertIn(response.status_code, [200, 500],
                     "应正确处理无效数据")

        logger.info(f"✅ 错误处理测试通过: status={response.status_code}")

    def test_09_concurrent_requests(self):
        """测试9: 并发请求处理"""
        logger.info("测试并发请求...")

        import concurrent.futures

        def send_request(index):
            data = {
                "type": "url_verification",
                "challenge": f"concurrent-{index}"
            }
            response = requests.post(self.webhook_url, json=data)
            return response.status_code == 200

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(send_request, i) for i in range(10)]
            results = [f.result() for f in futures]

        self.assertTrue(all(results), "所有并发请求应成功处理")
        logger.info(f"✅ 并发测试通过: 10个请求全部成功")

    def test_10_webhook_configuration_check(self):
        """测试10: Webhook配置验证（集成测试）"""
        logger.info("验证完整的webhook配置...")

        checks = {
            "服务运行": False,
            "URL可访问": False,
            "凭证有效": False,
            "消息处理": False
        }

        # 检查服务
        try:
            response = requests.get(self.health_url)
            checks["服务运行"] = response.status_code == 200
        except:
            pass

        # 检查URL
        try:
            response = requests.post(self.webhook_url, json={
                "type": "url_verification",
                "challenge": "test"
            })
            checks["URL可访问"] = response.status_code == 200
        except:
            pass

        # 检查凭证
        checks["凭证有效"] = bool(self.app_id and self.app_secret)

        # 检查消息处理
        try:
            response = requests.post(self.webhook_url, json={
                "type": "event_callback",
                "event": {
                    "type": "im.message.receive_v1",
                    "message": {
                        "content": '{"text":"test"}',
                        "chat_id": "test_chat"
                    },
                    "sender": {
                        "sender_id": {"open_id": "test"}
                    }
                }
            })
            checks["消息处理"] = response.status_code == 200
        except:
            pass

        # 输出检查结果
        for check, passed in checks.items():
            status = "✅" if passed else "❌"
            logger.info(f"{status} {check}: {passed}")

        all_passed = all(checks.values())
        if not all_passed:
            logger.warning("\n⚠️ Webhook配置不完整，需要在飞书开放平台配置:")
            logger.warning("1. 访问: https://open.feishu.cn/app/cli_a9ad59fd26389cee")
            logger.warning("2. 配置事件订阅URL: http://139.162.52.158:33301/webhook/feishu")
            logger.warning("3. 启用事件: im.message.receive_v1")

        self.assertTrue(all_passed, "Webhook配置应完整")


def run_tests():
    """运行测试套件"""
    # 创建测试套件
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestAITeacherWebhook)

    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # 生成报告
    print("\n" + "=" * 60)
    print("测试报告总结")
    print("=" * 60)
    print(f"运行测试: {result.testsRun}")
    print(f"成功: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"失败: {len(result.failures)}")
    print(f"错误: {len(result.errors)}")

    if result.failures:
        print("\n失败的测试:")
        for test, traceback in result.failures:
            print(f"- {test}")

    if result.errors:
        print("\n出错的测试:")
        for test, traceback in result.errors:
            print(f"- {test}")

    # 返回是否全部通过
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()

    if not success:
        print("\n" + "❌" * 30)
        print("测试未通过，AI初老师webhook配置存在问题")
        print("❌" * 30)
        sys.exit(1)
    else:
        print("\n" + "✅" * 30)
        print("所有测试通过！AI初老师webhook配置正确")
        print("✅" * 30)
        sys.exit(0)