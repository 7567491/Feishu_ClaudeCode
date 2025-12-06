/**
 * Paper Downloader
 * 调用 Python 脚本下载论文 PDF
 */

import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PaperDownloader {
  constructor() {
    this.pythonScript = path.join(__dirname, 'download-paper.py');
    this.timeout = 60000; // 60 秒超时
    this.maxRetries = 2; // 最多重试 2 次
  }

  /**
   * 下载单篇论文
   * @param {object} paper - 论文信息 {title, author, year}
   * @param {string} outputDir - 输出目录
   * @returns {Promise<{success: boolean, filePath: string, error: string}>}
   */
  async downloadPaper(paper, outputDir) {
    console.log(`[PaperDownloader] 下载论文: ${paper.title}`);

    // 重试逻辑
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this._downloadWithTimeout(paper, outputDir);

        if (result.success) {
          return result;
        }

        // 如果失败，等待后重试
        if (attempt < this.maxRetries - 1) {
          console.log(`[PaperDownloader] 重试 (${attempt + 1}/${this.maxRetries - 1})`);
          await this._sleep(2000); // 等待 2 秒
        }

      } catch (error) {
        console.error(`[PaperDownloader] 尝试 ${attempt + 1} 失败:`, error.message);

        if (attempt === this.maxRetries - 1) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    }

    return {
      success: false,
      error: '下载失败（已重试）'
    };
  }

  /**
   * 带超时的下载
   * @private
   */
  async _downloadWithTimeout(paper, outputDir) {
    return new Promise((resolve, reject) => {
      const args = [
        this.pythonScript,
        paper.title,
        paper.author || 'Unknown',
        paper.year || '2024',
        outputDir
      ];

      console.log(`[PaperDownloader] 执行命令: python3 ${args.join(' ')}`);

      const child = spawn('python3', args, {
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`[PaperDownloader] Python stderr: ${data.toString()}`);
      });

      child.on('error', (error) => {
        reject(new Error(`Python 执行失败: ${error.message}`));
      });

      child.on('close', (code) => {
        try {
          // 解析 JSON 输出
          const result = JSON.parse(stdout.trim());

          if (result.success) {
            resolve({
              success: true,
              filePath: result.path,
              message: result.message
            });
          } else {
            resolve({
              success: false,
              error: result.error || '未知错误'
            });
          }

        } catch (error) {
          reject(new Error(`解析 Python 输出失败: ${stdout}`));
        }
      });

      // 设置超时
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('下载超时'));
      }, this.timeout);
    });
  }

  /**
   * 验证 PDF 文件是否存在
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>}
   */
  async verifyPdfExists(filePath) {
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      return stats.size > 1024; // 至少 1KB
    } catch (error) {
      return false;
    }
  }

  /**
   * 批量下载论文
   * @param {Array<object>} papers - 论文列表
   * @param {string} outputDir - 输出目录
   * @returns {Promise<Array<{success: boolean, filePath: string}>>}
   */
  async downloadPapers(papers, outputDir) {
    const results = [];

    for (const paper of papers) {
      const result = await this.downloadPaper(paper, outputDir);
      results.push(result);
    }

    return results;
  }

  /**
   * 睡眠函数
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
