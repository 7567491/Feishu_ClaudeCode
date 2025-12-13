#!/usr/bin/env node
/**
 * Paper CLI - 独立命令行工具
 * 用法: node paper/cli.js "关键词"
 */

import path from 'path';
import { promises as fs } from 'fs';
import { ClaudeClient } from './lib/claude-client.js';
import { PaperParser } from './lib/parser.js';
import { PaperDownloader } from './lib/downloader.js';

class PaperCLI {
  constructor() {
    this.claudeClient = new ClaudeClient();
    this.parser = new PaperParser();
    this.downloader = new PaperDownloader();
  }

  log(message) {
    console.log(message);
  }

  async handle(keyword) {
    this.log(`🚀 Paper 文献检索系统已启动`);
    this.log(`🔍 关键词: ${keyword}\n`);

    try {
      // 步骤 1: 生成文献综述
      this.log('▶️ 步骤 1/5: 调用 Claude 生成文献综述...');

      let lastChunk = '';
      const reviewText = await this.claudeClient.generateReview(keyword, (chunk) => {
        // 实时显示生成内容
        process.stdout.write(chunk);
        lastChunk = chunk;
      });

      if (!reviewText) {
        this.log('\n❌ Claude 未返回结果，请稍后重试');
        return;
      }

      this.log('\n✅ 步骤 1/5 完成：文献综述已生成\n');

      // 步骤 2: 保存综述
      this.log('▶️ 步骤 2/5: 保存文献综述为 Markdown 文件...');
      const mdFilePath = await this.saveReview(keyword, reviewText);
      this.log(`✅ 步骤 2/5 完成：文件已保存至 ${mdFilePath}\n`);

      // 步骤 3: 解析论文表格
      this.log('▶️ 步骤 3/5: 解析论文列表...');
      const papers = this.parser.parse(reviewText);

      if (papers.length === 0) {
        this.log('⚠️ 未找到论文列表，流程结束');
        return;
      }

      this.log(`✅ 步骤 3/5 完成：找到 ${papers.length} 篇论文`);
      this.log('\n📋 论文清单：');
      papers.forEach((p, i) => {
        this.log(`  ${i+1}. ${p.titleCn || p.title}`);
      });
      this.log('');

      // 步骤 4: 下载 PDF
      this.log('▶️ 步骤 4/5: 并行下载 PDF 文件...');
      const pdfDir = path.join(path.dirname(mdFilePath), 'pdf');
      await fs.mkdir(pdfDir, { recursive: true });

      await this.downloadPapers(papers, pdfDir);

      // 步骤 5: 最终总结
      this.log('\n✅ 步骤 5/5 完成：所有操作已完成');
      this.log('\n🎉 Paper 文献检索完成！');
      this.log(`📊 结果汇总：`);
      this.log(`  📄 综述文件: ${mdFilePath}`);
      this.log(`  📚 论文总数: ${papers.length} 篇`);
      this.log(`  📁 PDF 目录: ${pdfDir}`);

    } catch (error) {
      this.log(`\n❌ 处理失败: ${error.message}`);
      console.error(error);
    }
  }

  async saveReview(keyword, content) {
    const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const keywordDir = path.join(process.cwd(), 'paper', 'lit', sanitizedKeyword);
    await fs.mkdir(keywordDir, { recursive: true });

    const filename = `${sanitizedKeyword}_文献综述.md`;
    const filePath = path.join(keywordDir, filename);

    const header = `# ${keyword} - 文献综述\n\n` +
                   `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n` +
                   `> 关键词: ${keyword}\n\n` +
                   `---\n\n`;

    await fs.writeFile(filePath, header + content, 'utf-8');
    return filePath;
  }

  async downloadPapers(papers, pdfDir) {
    let successCount = 0;
    let failCount = 0;

    const concurrency = 3;
    for (let i = 0; i < papers.length; i += concurrency) {
      const batch = papers.slice(i, i + concurrency);

      this.log(`\n🔄 正在下载第 ${i+1}-${Math.min(i+concurrency, papers.length)} 篇论文...`);

      const results = await Promise.allSettled(
        batch.map(paper => this.downloader.download(paper, pdfDir))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const paper = batch[j];
        const paperIndex = i + j + 1;

        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          this.log(`✅ [${paperIndex}/${papers.length}] ${paper.titleCn || paper.title}`);
          this.log(`   📄 ${path.basename(result.value.filePath)}`);
        } else {
          failCount++;
          const errorMsg = result.value?.error || result.reason?.message || '未知错误';
          this.log(`❌ [${paperIndex}/${papers.length}] ${paper.titleCn || paper.title}`);
          this.log(`   原因: ${errorMsg}`);
        }
      }
    }

    this.log(`\n📈 下载统计: 成功 ${successCount} 篇 | 失败 ${failCount} 篇`);
  }
}

// 主程序
const keyword = process.argv[2];
if (!keyword) {
  console.error('用法: node paper/cli.js "关键词"');
  console.error('示例: node paper/cli.js "大模型可靠性最高的上下文长度峰值"');
  process.exit(1);
}

const cli = new PaperCLI();
cli.handle(keyword).catch(error => {
  console.error('发生错误:', error);
  process.exit(1);
});
