/**
 * Paper Command Handler
 * 处理 `paper {关键词}` 指令，生成文献综述并下载 PDF
 */

import { queryClaude } from '../claude-cli.js';
import { PaperDownloader } from './paper-downloader.js';
import { FeishuFileHandler } from './feishu-file-handler.js';
import path from 'path';
import { promises as fs } from 'fs';

export class PaperCommandHandler {
  constructor(client) {
    this.client = client;
    this.downloader = new PaperDownloader();
  }

  /**
   * 主入口：处理 paper 指令
   * @param {string} chatId - 飞书会话 ID
   * @param {string} keyword - 关键词
   * @param {object} session - 会话对象
   */
  async handle(chatId, keyword, session) {
    console.log(`[PaperHandler] 开始处理 paper 指令: ${keyword}`);

    try {
      // 1. 发送开始消息
      await this.client.sendTextMessage(chatId, '📚 正在生成文献综述，请稍候...');

      // 2. 调用 Claude 生成文献综述
      const reviewText = await this.callClaudeForReview(keyword, session);

      if (!reviewText) {
        await this.client.sendTextMessage(chatId, '❌ Claude 未返回结果，请稍后重试');
        return;
      }

      // 3. 发送综述文本
      await this.client.sendTextMessage(chatId, reviewText);

      // 4. 解析论文表格
      const papers = this.parseTable(reviewText);

      if (papers.length === 0) {
        await this.client.sendTextMessage(chatId, '⚠️ 未找到论文列表，无法下载');
        console.log('[PaperHandler] 未解析到论文数据');
        return;
      }

      console.log(`[PaperHandler] 解析到 ${papers.length} 篇论文`);
      await this.client.sendTextMessage(chatId, `✅ 找到 ${papers.length} 篇论文，开始下载...`);

      // 5. 下载 PDF
      const pdfDir = path.join(session.project_path, 'pdf');
      await fs.mkdir(pdfDir, { recursive: true });

      await this.downloadAndSendPapers(chatId, papers, pdfDir);

      console.log('[PaperHandler] 处理完成');

    } catch (error) {
      console.error('[PaperHandler] 处理失败:', error.message);
      await this.client.sendTextMessage(chatId, `❌ 处理失败: ${error.message}`);
    }
  }

  /**
   * 调用 Claude 生成文献综述
   * @param {string} keyword - 关键词
   * @param {object} session - 会话对象
   * @returns {Promise<string>} 综述文本
   */
  async callClaudeForReview(keyword, session) {
    const prompt = `使用高引用的真实文献写一段文献综述
${keyword}
最后用表格形式列出论文的作者、发表年份、论文名称、引用次数、发表期刊以及论文名中文翻译`;

    console.log('[PaperHandler] 调用 Claude，提示词:', prompt);

    return new Promise((resolve, reject) => {
      let fullResponse = '';

      // 创建临时 WebSocket 接口来接收 Claude 输出
      const mockWs = {
        send: (data) => {
          try {
            const message = JSON.parse(data);

            if (message.type === 'assistant-message') {
              fullResponse += message.content || '';
            }

            if (message.type === 'done') {
              resolve(fullResponse);
            }
          } catch (err) {
            console.error('[PaperHandler] 解析 Claude 响应失败:', err.message);
          }
        },
        readyState: 1 // OPEN
      };

      // 调用 Claude
      queryClaude(prompt, {
        cwd: session.project_path,
        sessionId: null // 不使用现有会话，独立调用
      }, mockWs).catch(error => {
        console.error('[PaperHandler] Claude 调用失败:', error.message);
        reject(error);
      });

      // 设置超时
      setTimeout(() => {
        if (!fullResponse) {
          reject(new Error('Claude 响应超时'));
        }
      }, 120000); // 2 分钟超时
    });
  }

  /**
   * 解析论文表格
   * @param {string} text - 包含表格的文本
   * @returns {Array<object>} 论文列表
   */
  parseTable(text) {
    const lines = text.split('\n');
    const papers = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过空行、表头和分隔线
      if (!trimmed ||
          trimmed.includes('作者') ||
          trimmed.includes('Author') ||
          /^[\s\-|:]+$/.test(trimmed)) {
        continue;
      }

      // Markdown 表格：| 作者 | 年份 | 标题 | ...
      if (trimmed.startsWith('|')) {
        const cells = trimmed.split('|')
          .map(c => c.trim())
          .filter(Boolean);

        if (cells.length >= 6) {
          papers.push({
            author: cells[0],
            year: cells[1],
            title: cells[2],
            citations: parseInt(cells[3]) || 0,
            journal: cells[4],
            titleCn: cells[5]
          });
        }
      }
    }

    return papers;
  }

  /**
   * 下载论文并发送
   * @param {string} chatId - 飞书会话 ID
   * @param {Array<object>} papers - 论文列表
   * @param {string} pdfDir - PDF 保存目录
   */
  async downloadAndSendPapers(chatId, papers, pdfDir) {
    let successCount = 0;
    let failCount = 0;

    // 限制并发数为 3
    const concurrency = 3;
    for (let i = 0; i < papers.length; i += concurrency) {
      const batch = papers.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        batch.map(paper => this.downloader.downloadPaper(paper, pdfDir))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const paper = batch[j];

        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          console.log(`[PaperHandler] 下载成功: ${result.value.filePath}`);

          // 发送 PDF 文件
          try {
            await FeishuFileHandler.handleFileSend(
              this.client,
              chatId,
              pdfDir,
              path.basename(result.value.filePath)
            );
          } catch (error) {
            console.error(`[PaperHandler] 发送失败: ${error.message}`);
            await this.client.sendTextMessage(chatId, `⚠️ "${paper.titleCn}" 下载成功但发送失败`);
          }
        } else {
          failCount++;
          console.log(`[PaperHandler] 下载失败: ${paper.title}`);
        }
      }

      // 更新进度
      const processed = Math.min(i + concurrency, papers.length);
      await this.client.sendTextMessage(chatId, `📥 下载进度：${processed}/${papers.length}`);
    }

    // 发送最终统计
    await this.client.sendTextMessage(chatId,
      `✅ 下载完成！成功 ${successCount} 篇，失败 ${failCount} 篇`
    );
  }
}
