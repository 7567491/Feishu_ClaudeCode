#!/usr/bin/env python3
"""
端口管理器 - 管理全栈应用的端口分配
"""
import os
import csv
import socket
from datetime import datetime
from typing import Optional, List, Dict


class PortManager:
    """端口分配管理器"""

    def __init__(self, csv_file: str = "/home/ccp/teacher/port.csv"):
        """
        初始化端口管理器

        Args:
            csv_file: 端口记录CSV文件路径
        """
        self.csv_file = csv_file
        self.start_port = 57001
        self._ensure_csv_exists()

    def _ensure_csv_exists(self):
        """确保CSV文件存在，如果不存在则创建"""
        if not os.path.exists(self.csv_file):
            os.makedirs(os.path.dirname(self.csv_file) or '.', exist_ok=True)
            with open(self.csv_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['port', 'app_name', 'user', 'created_at'])

    def _is_port_available(self, port: int) -> bool:
        """
        检查端口是否可用

        Args:
            port: 端口号

        Returns:
            True if available, False otherwise
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.1)
                result = s.connect_ex(('localhost', port))
                return result != 0
        except:
            return True

    def _get_all_allocated_ports(self) -> Dict[str, int]:
        """
        获取所有已分配的端口

        Returns:
            {app_name: port} 字典
        """
        allocated = {}
        if os.path.exists(self.csv_file):
            with open(self.csv_file, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get('app_name') and row.get('port'):
                        allocated[row['app_name']] = int(row['port'])
        return allocated

    def get_port(self, app_name: str) -> Optional[int]:
        """
        获取应用已分配的端口

        Args:
            app_name: 应用名称

        Returns:
            端口号，如果未分配则返回None
        """
        allocated = self._get_all_allocated_ports()
        return allocated.get(app_name)

    def allocate_port(self, app_name: str, user: str = "") -> int:
        """
        为应用分配端口

        Args:
            app_name: 应用名称
            user: 用户名

        Returns:
            分配的端口号
        """
        # 检查是否已经分配
        existing_port = self.get_port(app_name)
        if existing_port:
            return existing_port

        # 获取所有已分配的端口
        allocated = self._get_all_allocated_ports()
        used_ports = set(allocated.values())

        # 从起始端口开始查找可用端口
        port = self.start_port
        while port in used_ports or not self._is_port_available(port):
            port += 1

        # 记录到CSV
        with open(self.csv_file, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                port,
                app_name,
                user,
                datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            ])

        return port

    def list_all(self) -> List[Dict]:
        """
        列出所有端口分配

        Returns:
            端口分配列表
        """
        allocations = []
        if os.path.exists(self.csv_file):
            with open(self.csv_file, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get('port'):
                        allocations.append({
                            'port': int(row['port']),
                            'app_name': row.get('app_name', ''),
                            'user': row.get('user', ''),
                            'created_at': row.get('created_at', '')
                        })
        return allocations