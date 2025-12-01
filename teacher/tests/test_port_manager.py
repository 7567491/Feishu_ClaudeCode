#!/usr/bin/env python3
"""
端口管理器测试用例
"""
import unittest
import os
import tempfile
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.port_manager import PortManager


class TestPortManager(unittest.TestCase):
    """端口管理器测试"""

    def setUp(self):
        """测试初始化"""
        # 使用临时文件进行测试
        self.temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
        self.temp_file.close()
        self.port_manager = PortManager(self.temp_file.name)

    def tearDown(self):
        """清理测试文件"""
        if os.path.exists(self.temp_file.name):
            os.unlink(self.temp_file.name)

    def test_allocate_first_port(self):
        """测试分配第一个端口"""
        port = self.port_manager.allocate_port("test_app1", "user1")
        self.assertEqual(port, 57001)

    def test_allocate_sequential_ports(self):
        """测试连续分配端口"""
        port1 = self.port_manager.allocate_port("test_app1", "user1")
        port2 = self.port_manager.allocate_port("test_app2", "user2")
        port3 = self.port_manager.allocate_port("test_app3", "user3")

        self.assertEqual(port1, 57001)
        self.assertEqual(port2, 57002)
        self.assertEqual(port3, 57003)

    def test_get_existing_port(self):
        """测试获取已分配的端口"""
        port1 = self.port_manager.allocate_port("test_app", "user1")
        port2 = self.port_manager.get_port("test_app")

        self.assertEqual(port1, port2)

    def test_port_in_use_detection(self):
        """测试端口占用检测（模拟）"""
        # 分配几个端口
        self.port_manager.allocate_port("app1", "user1")  # 57001
        self.port_manager.allocate_port("app2", "user2")  # 57002

        # 下一个应该是57003
        port = self.port_manager.allocate_port("app3", "user3")
        self.assertEqual(port, 57003)

    def test_csv_persistence(self):
        """测试CSV文件持久化"""
        # 分配端口
        port1 = self.port_manager.allocate_port("persistent_app", "user1")

        # 创建新实例，读取相同文件
        new_manager = PortManager(self.temp_file.name)
        port2 = new_manager.get_port("persistent_app")

        self.assertEqual(port1, port2)

    def test_list_all_ports(self):
        """测试列出所有端口分配"""
        self.port_manager.allocate_port("app1", "user1")
        self.port_manager.allocate_port("app2", "user2")

        all_ports = self.port_manager.list_all()
        self.assertEqual(len(all_ports), 2)
        self.assertEqual(all_ports[0]['app_name'], "app1")
        self.assertEqual(all_ports[1]['app_name'], "app2")


if __name__ == "__main__":
    unittest.main()