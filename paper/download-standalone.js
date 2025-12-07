#!/usr/bin/env node
/**
 * 独立下载脚本 - 从已有综述文件下载 PDF
 * 用法: node download-standalone.js <关键词>
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PaperParser } from './lib/parser.js';
import { PaperDownloader } from './lib/downloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const keyword = process.argv[2] || '思考的快与慢';

  console.log(`\n🚀 Paper PDF 下载工具`);
  console.log(`📋 关键词: ${keyword}\n`);

  try {
    // 步骤 1: 定位综述文件
    const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const reviewPath = path.join(__dirname, 'lit', sanitizedKeyword, `${sanitizedKeyword}_文献综述.md`);
    const pdfDir = path.join(__dirname, 'lit', sanitizedKeyword, 'pdf');

    console.log(`📄 读取综述文件: ${reviewPath}`);
    const reviewText = await fs.readFile(reviewPath, 'utf-8');

    // 步骤 2: 解析论文表格
    console.log(`\n🔍 解析论文列表...`);
    const parser = new PaperParser();
    const papers = parser.parse(reviewText);

    if (papers.length === 0) {
      console.log('⚠️  未找到论文列表，请检查综述文件格式');
      process.exit(1);
    }

    console.log(`✅ 找到 ${papers.length} 篇论文\n`);
    papers.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.titleCn || p.title}`);
    });

    // 步骤 3: 创建 PDF 目录
    await fs.mkdir(pdfDir, { recursive: true });
    console.log(`\n📁 PDF 保存目录: ${pdfDir}`);

    // 步骤 4: 下载 PDF
    console.log(`\n⬇️  开始下载 PDF (并发数: 3)...\n`);
    const downloader = new PaperDownloader();
    const results = await downloader.downloadBatch(papers, pdfDir, 3);

    // 步骤 5: 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 下载完成！`);
    console.log(`${'='.repeat(60)}\n`);
    console.log(`📊 统计:`);
    console.log(`   总计: ${papers.length} 篇`);
    console.log(`   ✓ 成功: ${successCount} 篇`);
    console.log(`   ✗ 失败: ${failCount} 篇\n`);

    // 步骤 6: 显示成功下载的文件
    if (successCount > 0) {
      console.log(`📚 成功下载的文件:\n`);
      for (let i = 0; i < results.length; i++) {
        if (results[i].success) {
          console.log(`   ${i+1}. ${path.basename(results[i].filePath)}`);
        }
      }
      console.log();
    }

    // 步骤 7: 显示失败的论文
    if (failCount > 0) {
      console.log(`❌ 下载失败的论文:\n`);
      for (let i = 0; i < results.length; i++) {
        if (!results[i].success) {
          console.log(`   ${i+1}. ${papers[i].titleCn || papers[i].title}`);
          console.log(`      原因: ${results[i].error}\n`);
        }
      }
    }

    console.log(`\n💡 提示: PDF 文件保存在 ${pdfDir}`);

  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

main();
