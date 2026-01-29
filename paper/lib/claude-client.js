/**
 * ClaudeClient - Claude 子进程封装
 * 管理 Claude CLI 调用，支持流式输出
 */

import { spawn } from 'child_process';

export class ClaudeClient {
  constructor() {
    this.claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
    this.timeout = 120000; // 120 秒超时
  }

  /**
   * 生成文献综述
   * @param {string} keyword - 关键词
   * @param {Function} onProgress - 进度回调函数 (chunk) => void
   * @returns {Promise<string>} 完整综述文本
   */
  async generateReview(keyword, onProgress) {
    const prompt = `使用高引用的真实文献写一段文献综述
${keyword}
最后用表格形式列出论文的作者、发表年份、论文名称、引用次数、发表期刊以及论文名中文翻译`;

    console.log('[ClaudeClient] 启动 Claude 独立子进程，关键词:', keyword);

    return new Promise((resolve, reject) => {
      let fullResponse = '';
      let errorOutput = '';

      // 构建命令参数
      const args = [
        '-p',  // print mode
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',  // 跳过权限确认以实现自动化
        prompt
      ];

      console.log('[ClaudeClient] 启动子进程:', this.claudePath, args.slice(0, -1).join(' '), `"${prompt.substring(0, 50)}..."`);

      // 启动 Claude 子进程
      const claudeProcess = spawn(this.claudePath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // 监听子进程启动
      claudeProcess.on('spawn', () => {
        console.log('[ClaudeClient] Claude 子进程已启动，PID:', claudeProcess.pid);
      });

      // 处理标准输出（stream-json 格式）
      let stdoutBuffer = '';
      claudeProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop(); // 保留不完整的行

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message = JSON.parse(line);

            // 处理 assistant 消息（包含实际回复内容）
            if (message.type === 'assistant' && message.message) {
              const contentBlocks = message.message.content || [];

              // 提取所有 text 类型的内容块
              for (const block of contentBlocks) {
                if (block.type === 'text') {
                  const text = block.text || '';
                  fullResponse += text;

                  // 调用进度回调
                  if (onProgress && typeof onProgress === 'function') {
                    onProgress(text);
                  }
                }
              }
            }

            // 处理最终结果（可选，用于记录完成状态）
            if (message.type === 'result') {
              console.log('[ClaudeClient] Claude 子进程完成，输出长度:', fullResponse.length);
            }
          } catch (err) {
            // 非 JSON 行，可能是普通输出
            console.log('[ClaudeClient] 子进程输出:', line);
          }
        }
      });

      // 处理错误输出
      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('[ClaudeClient] 子进程错误输出:', data.toString());
      });

      // 进程退出
      claudeProcess.on('close', (code) => {
        console.log('[ClaudeClient] Claude 子进程退出，退出码:', code);

        if (code === 0 && fullResponse) {
          resolve(fullResponse);
        } else if (!fullResponse) {
          reject(new Error(`Claude 子进程未返回内容（退出码: ${code}）\n错误输出: ${errorOutput}`));
        } else {
          // 即使退出码非 0，但有输出就返回
          console.warn('[ClaudeClient] 子进程退出码非 0 但有输出，继续处理');
          resolve(fullResponse);
        }
      });

      // 进程错误
      claudeProcess.on('error', (error) => {
        console.error('[ClaudeClient] 子进程启动失败:', error.message);
        reject(new Error(`无法启动 Claude 子进程: ${error.message}`));
      });

      // 超时保护
      setTimeout(() => {
        if (claudeProcess.exitCode === null) {
          console.warn('[ClaudeClient] Claude 子进程超时，强制终止');
          claudeProcess.kill('SIGTERM');
          reject(new Error(`Claude 子进程超时（${this.timeout / 1000}秒）`));
        }
      }, this.timeout);
    });
  }
}
