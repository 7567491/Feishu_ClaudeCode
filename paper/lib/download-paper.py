#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Paper Download Wrapper
用于从 Node.js 调用的简单 PDF 下载脚本
"""

import sys
import json
import os
import requests
import re
from urllib.parse import quote

def sanitize_filename(filename):
    """清理文件名，移除非法字符"""
    # 移除特殊字符
    filename = re.sub(r'[<>:"/\\|?*]', '', filename)
    # 限制长度
    if len(filename) > 200:
        filename = filename[:200]
    return filename.strip()

def search_and_download_paper(title, author, year, output_dir):
    """
    搜索并下载论文 PDF

    Args:
        title: 论文标题
        author: 作者
        year: 年份
        output_dir: 输出目录

    Returns:
        dict: {success: bool, path: str, error: str}
    """
    try:
        # 确保输出目录存在
        os.makedirs(output_dir, exist_ok=True)

        # 生成文件名
        safe_title = sanitize_filename(title)
        filename = f"{safe_title}.pdf"
        filepath = os.path.join(output_dir, filename)

        # 如果文件已存在，直接返回
        if os.path.exists(filepath):
            return {
                'success': True,
                'path': filepath,
                'message': '文件已存在'
            }

        # 尝试从多个来源下载
        sources = [
            ('Google Scholar', lambda: search_google_scholar(title, author, year)),
            ('arXiv', lambda: search_arxiv(title)),
            ('SciHub', lambda: search_scihub(title))
        ]

        for source_name, search_func in sources:
            print(f"尝试从 {source_name} 下载...", file=sys.stderr)

            try:
                pdf_url = search_func()
                if pdf_url:
                    print(f"找到 PDF URL: {pdf_url}", file=sys.stderr)

                    # 下载 PDF
                    if download_pdf(pdf_url, filepath):
                        return {
                            'success': True,
                            'path': filepath,
                            'message': f'从 {source_name} 下载成功'
                        }
            except Exception as e:
                print(f"{source_name} 失败: {e}", file=sys.stderr)
                continue

        return {
            'success': False,
            'error': '所有来源均下载失败'
        }

    except Exception as e:
        return {
            'success': False,
            'error': f'下载失败: {str(e)}'
        }

def search_google_scholar(title, author, year):
    """从 Google Scholar 搜索论文 PDF"""
    try:
        import time

        # 构建搜索查询
        query = f"{title} {author} {year} filetype:pdf"
        encoded_query = quote(query)

        # Google Scholar 搜索 URL
        url = f"https://scholar.google.com/scholar?q={encoded_query}"

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://www.google.com/'
        }

        # 添加延迟避免触发反爬虫
        time.sleep(2)

        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            # 简单解析 HTML，查找 PDF 链接
            html = response.text

            # 查找 [PDF] 链接
            import re
            pdf_pattern = r'href="([^"]+\.pdf)"'
            matches = re.findall(pdf_pattern, html)

            if matches:
                print(f"Google Scholar 找到 PDF 链接: {matches[0]}", file=sys.stderr)
                return matches[0]

            # 尝试查找其他可能的 PDF 链接
            citation_pattern = r'data-clk-atid="[^"]*"\s+href="([^"]+)"'
            citation_matches = re.findall(citation_pattern, html)

            for link in citation_matches:
                if 'pdf' in link.lower():
                    print(f"Google Scholar 找到可能的 PDF: {link}", file=sys.stderr)
                    return link
        else:
            print(f"Google Scholar HTTP {response.status_code}", file=sys.stderr)

        return None

    except Exception as e:
        print(f"Google Scholar 搜索异常: {e}", file=sys.stderr)
        return None

def search_arxiv(title):
    """从 arXiv 搜索 PDF"""
    try:
        # arXiv API 搜索
        import urllib.request
        from xml.etree import ElementTree

        query = quote(title)
        url = f"http://export.arxiv.org/api/query?search_query=ti:{query}&max_results=1"

        with urllib.request.urlopen(url, timeout=10) as response:
            xml_data = response.read()
            root = ElementTree.fromstring(xml_data)

            # 查找 PDF 链接
            for entry in root.findall('{http://www.w3.org/2005/Atom}entry'):
                for link in entry.findall('{http://www.w3.org/2005/Atom}link'):
                    if link.get('title') == 'pdf':
                        return link.get('href')

        return None

    except Exception as e:
        print(f"arXiv 搜索失败: {e}", file=sys.stderr)
        return None

def search_scihub(title):
    """从 Sci-Hub 搜索（仅作为最后手段）"""
    # 注意：Sci-Hub 的使用可能涉及版权问题，仅供研究使用
    try:
        import time

        # Sci-Hub 镜像列表（优先使用稳定的镜像）
        scihub_mirrors = [
            'https://sci-hub.se',
            'https://sci-hub.st',
            'https://sci-hub.ru',
            'https://sci-hub.ren'
        ]

        # 编码标题作为搜索关键词
        encoded_title = quote(title)

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }

        for mirror in scihub_mirrors:
            try:
                print(f"尝试 Sci-Hub 镜像: {mirror}", file=sys.stderr)

                # 搜索 URL
                search_url = f"{mirror}/{encoded_title}"

                time.sleep(1)  # 避免请求过快
                response = requests.get(search_url, headers=headers, timeout=20, allow_redirects=True)

                if response.status_code == 200:
                    # 解析 HTML，查找 PDF 链接
                    import re
                    html = response.text

                    # Sci-Hub 的 PDF 通常在 iframe 或直接链接中
                    # 模式 1: <iframe src="...pdf">
                    iframe_pattern = r'<iframe[^>]+src="([^"]+\.pdf[^"]*)"'
                    matches = re.findall(iframe_pattern, html, re.IGNORECASE)

                    if matches:
                        pdf_url = matches[0]
                        # 处理相对路径
                        if pdf_url.startswith('//'):
                            pdf_url = 'https:' + pdf_url
                        elif pdf_url.startswith('/'):
                            pdf_url = mirror + pdf_url

                        print(f"Sci-Hub 找到 PDF: {pdf_url}", file=sys.stderr)
                        return pdf_url

                    # 模式 2: <a href="...pdf">
                    link_pattern = r'href="([^"]+\.pdf[^"]*)"'
                    link_matches = re.findall(link_pattern, html, re.IGNORECASE)

                    if link_matches:
                        pdf_url = link_matches[0]
                        if pdf_url.startswith('//'):
                            pdf_url = 'https:' + pdf_url
                        elif pdf_url.startswith('/'):
                            pdf_url = mirror + pdf_url

                        print(f"Sci-Hub 找到 PDF (链接): {pdf_url}", file=sys.stderr)
                        return pdf_url

            except requests.Timeout:
                print(f"Sci-Hub 镜像超时: {mirror}", file=sys.stderr)
                continue
            except Exception as e:
                print(f"Sci-Hub 镜像失败 {mirror}: {e}", file=sys.stderr)
                continue

        print("所有 Sci-Hub 镜像均失败", file=sys.stderr)
        return None

    except Exception as e:
        print(f"Sci-Hub 搜索异常: {e}", file=sys.stderr)
        return None

def download_pdf(url, filepath):
    """
    下载 PDF 文件

    Args:
        url: PDF URL
        filepath: 保存路径

    Returns:
        bool: 是否成功
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(url, headers=headers, timeout=60, stream=True)

        if response.status_code == 200:
            # 检查是否为 PDF
            content_type = response.headers.get('Content-Type', '')
            if 'pdf' not in content_type.lower() and 'application' not in content_type.lower():
                # 检查前几个字节
                first_bytes = response.content[:4]
                if first_bytes != b'%PDF':
                    print(f"不是有效的 PDF 文件: {content_type}", file=sys.stderr)
                    return False

            # 保存文件
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # 验证文件大小
            if os.path.getsize(filepath) < 1024:  # 小于 1KB
                print("下载的文件太小，可能无效", file=sys.stderr)
                os.remove(filepath)
                return False

            return True
        else:
            print(f"HTTP 错误: {response.status_code}", file=sys.stderr)
            return False

    except Exception as e:
        print(f"下载失败: {e}", file=sys.stderr)
        if os.path.exists(filepath):
            os.remove(filepath)
        return False

def main():
    """主函数"""
    if len(sys.argv) != 5:
        print(json.dumps({
            'success': False,
            'error': 'Usage: download-paper.py <title> <author> <year> <output_dir>'
        }))
        sys.exit(1)

    title = sys.argv[1]
    author = sys.argv[2]
    year = sys.argv[3]
    output_dir = sys.argv[4]

    result = search_and_download_paper(title, author, year, output_dir)

    # 输出 JSON 结果到 stdout
    print(json.dumps(result, ensure_ascii=False))

    sys.exit(0 if result['success'] else 1)

if __name__ == '__main__':
    main()
