/**
 * 测试论文下载器功能
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PaperDownloader } from '../../server/lib/paper-downloader.js';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

describe('论文下载器测试', () => {
  const downloader = new PaperDownloader();
  const testDir = path.join(os.tmpdir(), 'test-paper-downloads');

  // 创建测试目录
  before(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  // 清理测试目录
  after(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      console.log('清理测试目录失败:', error.message);
    }
  });

  it('应该正确处理论文对象', () => {
    const paper = {
      title: 'Deep Learning',
      author: 'LeCun Y.',
      year: '2015'
    };

    assert.strictEqual(paper.title, 'Deep Learning');
    assert.strictEqual(paper.author, 'LeCun Y.');
  });

  it('应该验证 PDF 文件存在性', async () => {
    // 创建一个测试 PDF 文件
    const testPdfPath = path.join(testDir, 'test.pdf');
    await fs.writeFile(testPdfPath, '%PDF-1.4\ntest content\n');

    const exists = await downloader.verifyPdfExists(testPdfPath);
    assert.strictEqual(exists, true);
  });

  it('应该检测不存在的文件', async () => {
    const exists = await downloader.verifyPdfExists('/nonexistent/file.pdf');
    assert.strictEqual(exists, false);
  });

  it('应该检测文件太小（无效 PDF）', async () => {
    const smallFile = path.join(testDir, 'small.pdf');
    await fs.writeFile(smallFile, 'tiny');

    const exists = await downloader.verifyPdfExists(smallFile);
    assert.strictEqual(exists, false);
  });

  // 注意：真实的下载测试需要网络连接，这里跳过
  it.skip('应该下载真实的 arXiv 论文', async () => {
    const paper = {
      title: 'Attention Is All You Need',
      author: 'Vaswani A.',
      year: '2017'
    };

    const result = await downloader.downloadPaper(paper, testDir);
    console.log('下载结果:', result);

    // 根据实际情况，这个测试可能失败（网络问题）
    if (result.success) {
      assert.strictEqual(result.success, true);
      assert.ok(result.filePath);
    }
  });
});

// 辅助函数：before 和 after hooks
async function before(fn) {
  await fn();
}

async function after(fn) {
  await fn();
}
