#!/usr/bin/env python3
"""
AutoMD MCP Server
提供 Markdown 转微信公众号发布功能的 MCP 服务
"""
import os
import sys
import json
import argparse
from pathlib import Path
from typing import Optional

# 添加 automd 项目路径
AUTOMD_PATH = '/home/wexin/automd'
sys.path.insert(0, AUTOMD_PATH)

from src.config.config_manager import ConfigManager
from src.file_processor.file_processor import FileProcessor
from src.content_converter.content_converter import ContentConverter
from src.wechat_api.wechat_client import WeChatAPIClient
from src.utils.logger import setup_logger
from cover_config import get_cover_for_title, get_cover_for_content


class AutoMDMCPServer:
    """AutoMD MCP Server 实现"""

    def __init__(self, credentials_file: Optional[str] = None):
        """初始化 MCP 服务器

        Args:
            credentials_file: 可选的凭据文件路径
        """
        self.logger = setup_logger()
        self.credentials_file = credentials_file or os.path.expanduser('~/.automd-credentials.json')
        self._load_credentials()

        # 初始化组件
        self.config_manager = ConfigManager()
        self.file_processor = FileProcessor()
        self.content_converter = ContentConverter()
        self.wechat_client = WeChatAPIClient(self.config_manager)

    def _load_credentials(self):
        """从文件加载凭据并设置环境变量"""
        if os.path.exists(self.credentials_file):
            with open(self.credentials_file, 'r') as f:
                creds = json.load(f)
                os.environ['WECHAT_APPID'] = creds.get('appid', '')
                os.environ['WECHAT_APP_SECRET'] = creds.get('app_secret', '')
                os.environ['WECHAT_GH_ID'] = creds.get('gh_id', '')
                self.logger.info(f"已从 {self.credentials_file} 加载凭据")

    def publish_markdown(self,
                        markdown_content: str,
                        title: Optional[str] = None,
                        cover_image: Optional[str] = None,
                        source_file: Optional[str] = None) -> dict:
        """将 Markdown 内容发布到微信公众号

        Args:
            markdown_content: Markdown 内容
            title: 文章标题（可选，自动提取）
            cover_image: 封面图片路径（可选，智能选择）
            source_file: 源文件路径（用于标题提取）

        Returns:
            dict: 包含 success、draft_id、message 的结果字典
        """
        try:
            # 转换格式
            self.logger.info("转换 Markdown 为 HTML 格式")
            wechat_content = self.content_converter.convert_to_wechat(
                markdown_content,
                source_file or 'stdin'
            )

            # 确定标题
            if not title:
                title = self.file_processor.extract_title(
                    markdown_content,
                    source_file or 'stdin'
                )

            # 智能选择封面
            if not cover_image:
                cover_image = get_cover_for_title(title)
                if not cover_image:
                    cover_image = get_cover_for_content(markdown_content)

                if cover_image:
                    self.logger.info(f"智能选择封面: {cover_image}")
                else:
                    cover_image = self.config_manager.default_cover_image
                    self.logger.info("使用默认封面")

            # 上传到微信公众号
            self.logger.info("上传到微信公众号草稿箱")
            result = self.wechat_client.create_draft(title, wechat_content, cover_image)

            return result

        except Exception as e:
            self.logger.error(f"发布失败: {str(e)}")
            return {
                'success': False,
                'message': str(e)
            }

    def publish_file(self,
                    file_path: str,
                    title: Optional[str] = None,
                    cover_image: Optional[str] = None) -> dict:
        """发布 Markdown 文件到微信公众号

        Args:
            file_path: Markdown 文件路径
            title: 文章标题（可选）
            cover_image: 封面图片路径（可选）

        Returns:
            dict: 发布结果
        """
        try:
            # 读取文件
            self.logger.info(f"读取文件: {file_path}")
            content = self.file_processor.read_file(file_path)

            # 调用发布方法
            return self.publish_markdown(
                markdown_content=content,
                title=title,
                cover_image=cover_image,
                source_file=file_path
            )

        except Exception as e:
            self.logger.error(f"发布文件失败: {str(e)}")
            return {
                'success': False,
                'message': str(e)
            }


def handle_mcp_request(request: dict, server: AutoMDMCPServer) -> dict:
    """处理 MCP 请求

    Args:
        request: MCP 请求字典
        server: AutoMDMCPServer 实例

    Returns:
        dict: MCP 响应
    """
    method = request.get('method')
    params = request.get('params', {})

    if method == 'publish_markdown':
        result = server.publish_markdown(
            markdown_content=params.get('content'),
            title=params.get('title'),
            cover_image=params.get('cover_image')
        )
        return {
            'jsonrpc': '2.0',
            'id': request.get('id'),
            'result': result
        }

    elif method == 'publish_file':
        result = server.publish_file(
            file_path=params.get('file_path'),
            title=params.get('title'),
            cover_image=params.get('cover_image')
        )
        return {
            'jsonrpc': '2.0',
            'id': request.get('id'),
            'result': result
        }

    elif method == 'list_methods':
        return {
            'jsonrpc': '2.0',
            'id': request.get('id'),
            'result': {
                'methods': [
                    {
                        'name': 'publish_markdown',
                        'description': '将 Markdown 内容发布到微信公众号草稿箱',
                        'params': {
                            'content': '(必需) Markdown 内容',
                            'title': '(可选) 文章标题，不提供则自动提取',
                            'cover_image': '(可选) 封面图片路径，不提供则智能选择'
                        }
                    },
                    {
                        'name': 'publish_file',
                        'description': '发布 Markdown 文件到微信公众号草稿箱',
                        'params': {
                            'file_path': '(必需) Markdown 文件路径',
                            'title': '(可选) 文章标题',
                            'cover_image': '(可选) 封面图片路径'
                        }
                    }
                ]
            }
        }

    else:
        return {
            'jsonrpc': '2.0',
            'id': request.get('id'),
            'error': {
                'code': -32601,
                'message': f'方法不存在: {method}'
            }
        }


def run_stdio_server(credentials_file: Optional[str] = None):
    """运行 STDIO MCP 服务器"""
    server = AutoMDMCPServer(credentials_file)

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            request = json.loads(line)
            response = handle_mcp_request(request, server)

            print(json.dumps(response), flush=True)

        except json.JSONDecodeError as e:
            error_response = {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32700,
                    'message': f'解析错误: {str(e)}'
                }
            }
            print(json.dumps(error_response), flush=True)

        except Exception as e:
            error_response = {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': f'内部错误: {str(e)}'
                }
            }
            print(json.dumps(error_response), flush=True)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='AutoMD MCP Server')
    parser.add_argument('--credentials',
                       help='凭据文件路径（默认: ~/.automd-credentials.json）')
    parser.add_argument('--stdio', action='store_true',
                       help='以 STDIO 模式运行 MCP 服务器')

    args = parser.parse_args()

    if args.stdio:
        run_stdio_server(args.credentials)
    else:
        print("AutoMD MCP Server")
        print("使用 --stdio 启动服务器")


if __name__ == '__main__':
    main()
