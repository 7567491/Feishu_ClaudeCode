/**
 * Paper Command Handler
 * 处理 `paper {关键词}` 指令，生成文献综述并下载 PDF
 */

import { spawn } from 'child_process';
import { PaperDownloader } from './paper-downloader.js';
import { FeishuFileHandler } from './feishu-file-handler.js';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

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
        `🔍 关键词: ${keyword}\n` +
        `📁 工作目录: ${session.project_path}`
      );

      // 步骤 2: 启动 Claude 独立子进程生成文献综述
      await this.client.sendTextMessage(chatId, '\n\n▶️ 步骤 1/6: 启动 Claude 独立子进程...');
      const reviewText = await this.callClaudeSubprocess(keyword, session, chatId);

      if (!reviewText) {
        await this.client.sendTextMessage(chatId, '❌ Claude 子进程未返回结果，请稍后重试');
        return;
      }

      await this.client.sendTextMessage(chatId, '✅ 步骤 1/6 完成：文献综述已生成');

      // 步骤 3: 保存综述为 MD 文件
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 2/6: 保存文献综述为 Markdown 文件...');
      const mdFilePath = await this.saveReviewToMarkdown(keyword, reviewText, session.project_path);
      console.log(`[PaperHandler] 综述已保存至: ${mdFilePath}`);
      await this.client.sendTextMessage(chatId, `✅ 步骤 2/6 完成：文件已保存\n   📄 ${path.basename(mdFilePath)}`);

      // 步骤 4: 发送 MD 文件
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 3/6: 发送综述文件到对话...');
      await FeishuFileHandler.handleFileSend(
        this.client,
        chatId,
        path.dirname(mdFilePath),
        path.basename(mdFilePath)
      );
      await this.client.sendTextMessage(chatId, `✅ 步骤 3/6 完成：综述文件已发送`);

      // 步骤 5: 解析论文表格
      await this.client.sendTextMessage(chatId, '\n▶️ 步骤 4/6: 解析论文列表...');
      const papers = this.parseTable(reviewText);

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
      const pdfDir = path.join(session.project_path, 'pdf');
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
   * @param {string} projectPath - 项目路径
   * @returns {Promise<string>} 文件路径
   */
  async saveReviewToMarkdown(keyword, content, projectPath) {
    // 清理关键词作为文件名
    const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const filename = `${sanitizedKeyword}_文献综述.md`;
    const filePath = path.join(projectPath, filename);

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
   * 调用 Claude 独立子进程生成文献综述（实时流式输出）
   * @param {string} keyword - 关键词
   * @param {object} session - 会话对象
   * @param {string} chatId - 飞书会话ID（用于实时反馈）
   * @returns {Promise<string>} 综述文本
   */
  async callClaudeSubprocess(keyword, session, chatId) {
    const prompt = `使用高引用的真实文献写一段文献综述
${keyword}
最后用表格形式列出论文的作者、发表年份、论文名称、引用次数、发表期刊以及论文名中文翻译`;

    console.log('[PaperHandler] 启动 Claude 独立子进程，提示词:', prompt);

    return new Promise((resolve, reject) => {
      let fullResponse = '';
      let errorOutput = '';
      let messageBuffer = '';
      let processStarted = false;

      // 获取 Claude CLI 路径
      const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';

      // 构建命令参数
      const args = [
        '-p',  // print mode
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',  // 跳过权限确认以实现自动化
        prompt
      ];

      console.log('[PaperHandler] 启动子进程:', claudePath, args.slice(0, -1).join(' '), `"${prompt.substring(0, 50)}..."`);

      // 启动 Claude 子进程
      const claudeProcess = spawn(claudePath, args, {
        cwd: session.project_path,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // 监听子进程启动
      claudeProcess.on('spawn', () => {
        processStarted = true;
        console.log('[PaperHandler] Claude 子进程已启动，PID:', claudeProcess.pid);
        this.client.sendTextMessage(chatId,
          `✅ Claude 子进程已启动\n` +
          `   🔢 进程 ID: ${claudeProcess.pid}\n` +
          `   💬 开始实时接收输出...`
        ).catch(err => console.error('[PaperHandler] 发送启动消息失败:', err.message));
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

            if (message.type === 'assistant-message') {
              const content = message.content || '';
              fullResponse += content;
              messageBuffer += content;

              // 每累积 100 个字符或遇到双换行就发送一次
              if (messageBuffer.length >= 100 || messageBuffer.includes('\n\n')) {
                this.client.sendTextMessage(chatId, `📝 ${messageBuffer}`).catch(err => {
                  console.error('[PaperHandler] 发送实时进度失败:', err.message);
                });
                messageBuffer = '';
              }
            }

            if (message.type === 'done') {
              console.log('[PaperHandler] Claude 子进程完成，输出长度:', fullResponse.length);
            }
          } catch (err) {
            // 非 JSON 行，可能是普通输出
            console.log('[PaperHandler] 子进程输出:', line);
          }
        }
      });

      // 处理错误输出
      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('[PaperHandler] 子进程错误输出:', data.toString());
      });

      // 进程退出
      claudeProcess.on('close', (code) => {
        console.log('[PaperHandler] Claude 子进程退出，退出码:', code);

        // 发送剩余内容
        if (messageBuffer.length > 0) {
          this.client.sendTextMessage(chatId, `📝 ${messageBuffer}`).catch(err => {
            console.error('[PaperHandler] 发送最后进度失败:', err.message);
          });
        }

        if (code === 0 && fullResponse) {
          resolve(fullResponse);
        } else if (!fullResponse) {
          reject(new Error(`Claude 子进程未返回内容（退出码: ${code}）\n错误输出: ${errorOutput}`));
        } else {
          // 即使退出码非 0，但有输出就返回
          console.warn('[PaperHandler] 子进程退出码非 0 但有输出，继续处理');
          resolve(fullResponse);
        }
      });

      // 进程错误
      claudeProcess.on('error', (error) => {
        console.error('[PaperHandler] 子进程启动失败:', error.message);
        reject(new Error(`无法启动 Claude 子进程: ${error.message}`));
      });

      // 超时保护
      setTimeout(() => {
        if (claudeProcess.exitCode === null) {
          console.warn('[PaperHandler] Claude 子进程超时，强制终止');
          claudeProcess.kill('SIGTERM');
          reject(new Error('Claude 子进程超时（120秒）'));
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
   * 下载论文并发送（带详细进度）
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

      // 提示正在处理的论文
      const batchTitles = batch.map((p, idx) =>
        `${i + idx + 1}. ${p.titleCn || p.title}`
      ).join('\n');
      await this.client.sendTextMessage(chatId,
        `🔄 正在下载以下论文:\n${batchTitles}`
      );

      const results = await Promise.allSettled(
        batch.map(paper => this.downloader.downloadPaper(paper, pdfDir))
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
