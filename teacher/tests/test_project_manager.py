#!/usr/bin/env python3
"""
项目管理器测试用例
"""
import unittest
import sys
import os
import tempfile
import shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.project_manager import ProjectManager


class TestProjectManager(unittest.TestCase):
    """项目管理器测试"""

    def setUp(self):
        """测试初始化"""
        # 使用临时目录进行测试
        self.temp_dir = tempfile.mkdtemp()
        self.project_manager = ProjectManager(base_dir=self.temp_dir)

    def tearDown(self):
        """清理测试目录"""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_create_project_directory(self):
        """测试创建项目目录"""
        project_dir = self.project_manager.create_project_dir("zhangsan", 11)

        # 检查目录名称
        self.assertTrue(project_dir.endswith("zhangsan_11"))
        self.assertTrue(os.path.exists(project_dir))

    def test_generate_frontend_prompt(self):
        """测试生成前端应用Prompt"""
        prompt = self.project_manager.generate_frontend_prompt(
            user_nickname="张三",
            user_pinyin="zhangsan",
            app_name="扫雷",
            app_pinyin="saolei"
        )

        # 检查Prompt内容
        self.assertIn("开发一个小游戏", prompt)
        self.assertIn("小游戏名称：扫雷", prompt)
        self.assertIn("HTML标题显示：张三的扫雷", prompt)
        self.assertIn("文件名zhangsan_saolei.html", prompt)
        self.assertIn("http://zhangsan_saolei.linapp.fun", prompt)

    def test_generate_fullstack_prompt(self):
        """测试生成全栈应用Prompt"""
        prompt = self.project_manager.generate_fullstack_prompt(
            user_nickname="李四",
            user_pinyin="lisi",
            app_name="任务待办清单",
            app_pinyin="renwudaibanqingdan",
            app_id=31,
            project_dir="lisi_31"
        )

        # 检查Prompt内容
        self.assertIn("开发一个前端html+后端python+json格式数据存储的应用", prompt)
        self.assertIn("项目目录=lisi_31", prompt)
        self.assertIn("HTML标题显示\"李四的任务待办清单\"", prompt)
        self.assertIn("http://lisi_renwudaibanqingdan.linapp.fun", prompt)
        self.assertIn("端口占用表存放在/home/ccp/teacher/port.csv", prompt)
        self.assertIn("57001", prompt)

    def test_generate_bot2bot_message(self):
        """测试生成Bot-to-Bot消息"""
        # 前端应用消息
        message = self.project_manager.generate_bot2bot_message(
            user_nickname="USER_03C8",
            user_pinyin="zhanglu",
            app_id=11,
            app_name="扫雷",
            prompt="test prompt"
        )

        self.assertIn("已为【USER_03C8】创建项目：zhanglu_11", message)
        self.assertIn("📋 发送给小六的任务：", message)
        self.assertIn("test prompt", message)
        self.assertIn("🤖 AI初老师已将任务转发给我，正在处理中...", message)

    def test_create_fullstack_docs(self):
        """测试创建全栈应用文档"""
        project_dir = self.project_manager.create_project_dir("test", 31)

        # 创建需求文档
        need_doc = self.project_manager.create_need_doc(
            project_dir,
            "任务待办清单",
            "测试用户"
        )
        self.assertTrue(os.path.exists(need_doc))

        with open(need_doc, 'r') as f:
            content = f.read()
            self.assertIn("任务待办清单", content)
            self.assertIn("功能需求", content)

        # 创建架构设计文档
        design_doc = self.project_manager.create_design_doc(
            project_dir,
            "任务待办清单"
        )
        self.assertTrue(os.path.exists(design_doc))

        # 创建计划文档
        plan_doc = self.project_manager.create_plan_doc(
            project_dir,
            "任务待办清单"
        )
        self.assertTrue(os.path.exists(plan_doc))


if __name__ == "__main__":
    unittest.main()