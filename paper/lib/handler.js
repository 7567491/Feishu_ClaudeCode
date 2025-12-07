/**
 * PaperHandler - Paper 文献检索主处理器
 * 协调整个文献检索流程
 */

import path from 'path';
import { promises as fs } from 'fs';
import { ClaudeClient } from './claude-client.js';
import { PaperParser } from './parser.js';
import { PaperDownloader } from './downloader.js';

export class PaperHandler {
  constructor(client) {
    this.client = client;
    this.claudeClient = new ClaudeClient();
    this.parser = new PaperParser();
    this.downloader = new PaperDownloader();
  }

  /**
   * 主入口：处理 paper 指令
   * @param {string} chatId - 飞书会话 ID
   * @param {string} keyword - 关键词
   * @param {object} session - 会话对象（包含 project_path）
   */
  async handle(chatId, keyword, session) {
    console.log(`[PaperHandler] 开始处理 paper 指令: ${keyword}`);

    try {
      // 步骤 1: 发送开始消息
      await this.client.sendTextMessage(chatId,
        '🚀 Paper 文献检索系统已启动\n\n' +
        '📋 执行步骤：\n' +
        '  1️⃣ 启动 Claude 独立子进程生成文献综述\n' +
        '  2️⃣ 实时显示生成过程\n' +
        '  3️⃣ 保存为 Markdown 文件\n' +
        '  4️⃣ 解析论文列表\n' +
        '  5️⃣ 并行下载 PDF 文件\n' +
        '  6️⃣ 发送所有文件到对话\n\n' +
        `🔍 关键词: ${keyword}`
      );

      // 步骤 2: 生成文献综述
      await this.client.sendTextMessage(chatId, '\n\n▶️ 步骤 1/6: 启动 Claude 独立子进程...');

      let messageBuffer = '';
      const reviewText = await this.claudeClient.generateReview(keyword, (chunk) => {
        messageBuffer += chunk;

        // 每累积 100 个字符或遇到双换行就发送一次
        if (messageBuffer.length >= 100 || messageBuffer.includes('\n\n')) {
          this.client.sendTextMessage(chatId, `📝 ${messageBuffer}`).catch(err => {
            console.error('[PaperHandler] 发送实时进度失败:', err.message);
          });
          messageBuffer = '';
        }
      });

      // 发送剩余内容
      if (messageBuffer.length > 0) {
        await this.client.sendTextMessage(chatId, `📝 ${messageBuffer}`);
      }

      if (!reviewText) {
        await this.client.sendTextMessage(chatId, '❌ Claude 子进程未返回结果，请稍后重试');
        return;
      }

      await this.client.sendTextMessage(chatId, '✅ 步骤 1/6 完成：文献综述已生成');

      // 步骤 3: 保存综述为 MD 文件
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 2/6: 保存文献综述为 Markdown 文件...');
      const mdFilePath = await this.saveReview(keyword, reviewText);
      console.log(`[PaperHandler] 综述已保存至: ${mdFilePath}`);
      await this.client.sendTextMessage(chatId, `✅ 步骤 2/6 完成：文件已保存\n   📄 ${path.basename(mdFilePath)}`);

      // 步骤 4: 发送 MD 文件
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 3/6: 发送综述文件到对话...');

      // 动态导入 FeishuFileHandler
      const { FeishuFileHandler } = await import('../../server/lib/feishu-file-handler.js');
      await FeishuFileHandler.handleFileSend(
        this.client,
        chatId,
        path.dirname(mdFilePath),
        path.basename(mdFilePath)
      );
      await this.client.sendTextMessage(chatId, `✅ 步骤 3/6 完成：综述文件已发送`);

      // 步骤 5: 解析论文表格
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 4/6: 解析论文列表...');
      const papers = this.parser.parse(reviewText);

      if (papers.length === 0) {
        await this.client.sendTextMessage(chatId, '⚠️ 未找到论文列表，流程结束');
        console.log('[PaperHandler] 未解析到论文数据');
        return;
      }

      console.log(`[PaperHandler] 解析到 ${papers.length} 篇论文`);
      await this.client.sendTextMessage(chatId,
        `✅ 步骤 4/6 完成：找到 ${papers.length} 篇论文\n\n` +
        `📋 论文清单：\n${papers.map((p, i) => `  ${i+1}. ${p.titleCn || p.title}`).join('\n')}`
      );

      // 步骤 6: 下载 PDF
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 5/6: 并行下载 PDF 文件...');
      const pdfDir = path.join(path.dirname(mdFilePath), 'pdf');
      await fs.mkdir(pdfDir, { recursive: true });

      await this.downloadAndSendPapers(chatId, papers, pdfDir);

      // 步骤 7: 最终总结
      await this.client.sendTextMessage(chatId,
        `\n✅ 步骤 6/6 完成：所有文件已发送\n\n` +
        `🎉 Paper 文献检索完成！\n\n` +
        `📊 结果汇总：\n` +
        `  📄 综述文件: ${path.basename(mdFilePath)}\n` +
        `  📚 论文总数: ${papers.length} 篇\n` +
        `  📁 保存目录: ${pdfDir}`
      );

      console.log('[PaperHandler] 处理完成');

    } catch (error) {
      console.error('[PaperHandler] 处理失败:', error.message);
      await this.client.sendTextMessage(chatId, `❌ 处理失败: ${error.message}`);
    }
  }

  /**
   * 保存文献综述为 Markdown 文件
   * @param {string} keyword - 关键词
   * @param {string} content - 综述内容
   * @returns {Promise<string>} 文件路径
   */
  async saveReview(keyword, content) {
    // 清理关键词作为目录名
    const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');

    // 创建关键词专属目录：./paper/lit/{关键词}/
    const keywordDir = path.join(process.cwd(), 'paper', 'lit', sanitizedKeyword);
    await fs.mkdir(keywordDir, { recursive: true });

    // 文件名
    const filename = `${sanitizedKeyword}_文献综述.md`;
    const filePath = path.join(keywordDir, filename);

    // 添加文件头部信息
    const header = `# ${keyword} - 文献综述\n\n` +
                   `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n` +
                   `> 关键词: ${keyword}\n\n` +
                   `---\n\n`;

    const fullContent = header + content;

    await fs.writeFile(filePath, fullContent, 'utf-8');

    return filePath;
  }

  /**
   * 下载论文并发送（带详细进度）
   * @param {string} chatId - 飞书会话 ID
   * @param {Array<object>} papers - 论文列表
   * @param {string} pdfDir - PDF 保存目录
   */
  async downloadAndSendPapers(chatId, papers, pdfDir) {
    let successCount = 0;
    let failCount = 0;

    // 动态导入 FeishuFileHandler
    const { FeishuFileHandler } = await import('../../server/lib/feishu-file-handler.js');

    // 限制并发数为 3
    const concurrency = 3;
    for (let i = 0; i < papers.length; i += concurrency) {
      const batch = papers.slice(i, i + concurrency);

      // 提示正在处理的论文
      const batchTitles = batch.map((p, idx) =>
        `${i + idx + 1}. ${p.titleCn || p.title}`
      ).join('\n');
      await this.client.sendTextMessage(chatId,
        `🔄 正在下载以下论文:\n${batchTitles}`
      );

      const results = await Promise.allSettled(
        batch.map(paper => this.downloader.download(paper, pdfDir))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const paper = batch[j];
        const paperIndex = i + j + 1;

        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          console.log(`[PaperHandler] 下载成功: ${result.value.filePath}`);

          await this.client.sendTextMessage(chatId,
            `✅ [${paperIndex}/${papers.length}] 下载成功: ${paper.titleCn || paper.title}\n` +
            `   📄 文件: ${path.basename(result.value.filePath)}`
          );

          // 发送 PDF 文件
          try {
            await FeishuFileHandler.handleFileSend(
              this.client,
              chatId,
              pdfDir,
              path.basename(result.value.filePath)
            );
            await this.client.sendTextMessage(chatId, `📤 [${paperIndex}] 已发送到对话`);
          } catch (error) {
            console.error(`[PaperHandler] 发送失败: ${error.message}`);
            await this.client.sendTextMessage(chatId,
              `⚠️ [${paperIndex}] "${paper.titleCn}" 下载成功但发送失败: ${error.message}`
            );
          }
        } else {
          failCount++;
          const errorMsg = result.value?.error || result.reason?.message || '未知错误';
          console.log(`[PaperHandler] 下载失败: ${paper.title} - ${errorMsg}`);

          await this.client.sendTextMessage(chatId,
            `❌ [${paperIndex}/${papers.length}] 下载失败: ${paper.titleCn || paper.title}\n` +
            `   原因: ${errorMsg}`
          );
        }
      }

      // 更新进度统计
      const processed = Math.min(i + concurrency, papers.length);
      await this.client.sendTextMessage(chatId,
        `📊 当前进度: ${processed}/${papers.length} | 成功: ${successCount} | 失败: ${failCount}`
      );
    }

    // 发送最终统计
    await this.client.sendTextMessage(chatId,
      `\n✅ 下载完成！\n` +
      `📈 统计: 总计 ${papers.length} 篇\n` +
      `   ✓ 成功: ${successCount} 篇\n` +
      `   ✗ 失败: ${failCount} 篇`
    );
  }
}
