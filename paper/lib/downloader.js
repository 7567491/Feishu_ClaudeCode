/**
 * PaperDownloader - PDF 下载器
 * 调用 Python 脚本从多个数据源下载论文 PDF
 */

import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 错误类型枚举
const ErrorType = {
  NETWORK: 'network_error',      // 网络错误
  TIMEOUT: 'timeout_error',      // 超时
  RATE_LIMIT: 'rate_limit',      // 频率限制 (429)
  NOT_FOUND: 'not_found',        // 资源未找到 (404)
  SERVER_ERROR: 'server_error',  // 服务器错误 (5xx)
  PARSE_ERROR: 'parse_error',    // 解析错误
  UNKNOWN: 'unknown_error'       // 未知错误
};

export class PaperDownloader {
  constructor() {
    this.pythonScript = path.join(__dirname, 'download-paper.py');
    this.timeout = 60000; // 60 秒超时
    this.maxRetries = 5; // 增加到 5 次重试
    this.errorHistory = new Map(); // 记录错误历史 {paperTitle: [errorType, errorType, ...]}
  }

  /**
   * 下载单篇论文
   * @param {object} paper - 论文信息 {title, author, year}
   * @param {string} outputDir - 输出目录
   * @returns {Promise<{success: boolean, filePath: string, error: string}>}
   */
  async download(paper, outputDir) {
    console.log(`[PaperDownloader] 下载论文: ${paper.title}`);

    // 初始化错误历史
    if (!this.errorHistory.has(paper.title)) {
      this.errorHistory.set(paper.title, []);
    }

    // 智能重试逻辑
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this._downloadWithTimeout(paper, outputDir);

        if (result.success) {
          // 清理成功论文的错误历史
          this.errorHistory.delete(paper.title);
          return result;
        }

        // 分类错误
        const errorType = this._classifyError(result.error || '');
        this.errorHistory.get(paper.title).push(errorType);

        // 如果失败，智能等待后重试
        if (attempt < this.maxRetries - 1) {
          const waitTime = this._calculateWaitTime(errorType, attempt, paper.title);
          console.log(`[PaperDownloader] 错误类型: ${errorType}, 等待 ${waitTime}ms 后重试 (${attempt + 1}/${this.maxRetries - 1})`);
          await this._sleep(waitTime);
        }

      } catch (error) {
        const errorType = this._classifyError(error.message);
        this.errorHistory.get(paper.title).push(errorType);

        console.error(`[PaperDownloader] 尝试 ${attempt + 1} 失败 (${errorType}):`, error.message);

        if (attempt === this.maxRetries - 1) {
          return {
            success: false,
            error: error.message,
            errorType
          };
        }

        // 智能等待
        const waitTime = this._calculateWaitTime(errorType, attempt, paper.title);
        await this._sleep(waitTime);
      }
    }

    return {
      success: false,
      error: '下载失败（已达最大重试次数）'
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
   * 批量并发下载论文（Semaphore 模式）
   * @param {Array<object>} papers - 论文列表
   * @param {string} outputDir - 输出目录
   * @param {number} concurrency - 并发数（默认 3）
   * @returns {Promise<Array<{success: boolean, filePath: string, error: string}>>}
   */
  async downloadBatch(papers, outputDir, concurrency = 3) {
    const results = new Array(papers.length);
    let activeCount = 0;
    let currentIndex = 0;

    return new Promise((resolve) => {
      const startNext = () => {
        // 所有任务完成
        if (currentIndex >= papers.length && activeCount === 0) {
          resolve(results);
          return;
        }

        // 启动新任务（在并发限制内）
        while (activeCount < concurrency && currentIndex < papers.length) {
          const index = currentIndex++;
          const paper = papers[index];

          activeCount++;
          console.log(`[PaperDownloader] 启动下载 [${index + 1}/${papers.length}]: ${paper.title}`);

          this.download(paper, outputDir)
            .then((result) => {
              results[index] = result;
              activeCount--;
              console.log(`[PaperDownloader] 完成 [${index + 1}/${papers.length}], 剩余并发槽位: ${concurrency - activeCount}`);
              startNext(); // 完成后立即启动下一个
            })
            .catch((error) => {
              results[index] = {
                success: false,
                error: error.message || '未知错误'
              };
              activeCount--;
              console.error(`[PaperDownloader] 失败 [${index + 1}/${papers.length}]:`, error.message);
              startNext();
            });
        }
      };

      startNext();
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
   * 睡眠函数
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 错误分类器
   * @private
   */
  _classifyError(errorMessage) {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('timeout') || msg.includes('超时')) {
      return ErrorType.TIMEOUT;
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('频率限制')) {
      return ErrorType.RATE_LIMIT;
    }
    if (msg.includes('404') || msg.includes('not found') || msg.includes('未找到')) {
      return ErrorType.NOT_FOUND;
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('server error')) {
      return ErrorType.SERVER_ERROR;
    }
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('网络')) {
      return ErrorType.NETWORK;
    }
    if (msg.includes('parse') || msg.includes('解析')) {
      return ErrorType.PARSE_ERROR;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * 计算智能等待时间（指数退避 + 抖动）
   * @private
   * @param {string} errorType - 错误类型
   * @param {number} attempt - 当前尝试次数
   * @param {string} paperTitle - 论文标题（用于查询历史错误）
   * @returns {number} 等待时间（毫秒）
   */
  _calculateWaitTime(errorType, attempt, paperTitle) {
    // 基础等待时间（秒）
    const baseDelays = {
      [ErrorType.RATE_LIMIT]: 60,      // 频率限制：60 秒起步
      [ErrorType.TIMEOUT]: 10,         // 超时：10 秒
      [ErrorType.SERVER_ERROR]: 15,    // 服务器错误：15 秒
      [ErrorType.NETWORK]: 5,          // 网络错误：5 秒
      [ErrorType.NOT_FOUND]: 2,        // 资源未找到：2 秒（基本无望）
      [ErrorType.PARSE_ERROR]: 3,      // 解析错误：3 秒
      [ErrorType.UNKNOWN]: 5           // 未知错误：5 秒
    };

    const baseDelay = baseDelays[errorType] || 5;

    // 指数退避：base * (2 ^ attempt)
    let waitTime = baseDelay * Math.pow(2, attempt) * 1000;

    // 检查历史错误频率，如果同一论文频繁出错，增加等待时间
    const errorHistory = this.errorHistory.get(paperTitle) || [];
    const recentErrors = errorHistory.slice(-3); // 最近 3 次错误
    if (recentErrors.length >= 2 && recentErrors.every(e => e === errorType)) {
      waitTime *= 1.5; // 频繁相同错误，等待时间 x1.5
      console.log(`[PaperDownloader] 检测到频繁 ${errorType} 错误，增加等待时间`);
    }

    // 添加随机抖动（±20%），避免同时重试造成雪崩
    const jitter = 0.8 + Math.random() * 0.4; // 0.8 - 1.2
    waitTime *= jitter;

    // 设置上限（最多 5 分钟）
    const maxWait = 5 * 60 * 1000;
    waitTime = Math.min(waitTime, maxWait);

    return Math.floor(waitTime);
  }
}
