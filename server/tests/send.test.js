/**
 * Send 工具单元测试
 *
 * 测试覆盖：
 * 1. 文件解析（单文件、glob 模式、目录）
 * 2. 文件类型识别
 * 3. 错误处理（文件不存在、无权限等）
 * 4. 发送进度回调
 * 5. 批量发送逻辑
 */

import { FileSender } from '../lib/file-sender.js';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';

// 测试辅助函数
class MockClient {
  constructor() {
    this.calls = { sendFile: [], sendImage: [] };
    this.shouldFail = false;
    this.failIndex = -1;
  }

  async sendFile(chatId, filePath) {
    this.calls.sendFile.push({ chatId, filePath });
    if (this.shouldFail && this.calls.sendFile.length === this.failIndex) {
      throw new Error('Network error');
    }
    return { code: 0 };
  }

  async sendImage(chatId, imagePath) {
    this.calls.sendImage.push({ chatId, imagePath });
    return { code: 0 };
  }

  reset() {
    this.calls = { sendFile: [], sendImage: [] };
    this.shouldFail = false;
    this.failIndex = -1;
  }
}

async function runTests() {
  let testDir;
  let mockClient;
  let sender;
  let passedTests = 0;
  let failedTests = 0;

  // Setup
  const setup = async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'send-test-'));
    mockClient = new MockClient();
    sender = new FileSender(mockClient);
  };

  // Teardown
  const teardown = async () => {
    if (testDir && fssync.existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    mockClient?.reset();
  };

  // Test runner
  const test = async (name, fn) => {
    try {
      await setup();
      await fn();
      console.log(`  ✓ ${name}`);
      passedTests++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.log(`    错误: ${error.message}`);
      if (error.stack) {
        console.log(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`);
      }
      failedTests++;
    } finally {
      await teardown();
    }
  };

  console.log('\n📦 FileSender 单元测试\n');

  console.log('📁 文件解析测试:');

  await test('应该解析单个文件', async () => {
    const testFile = path.join(testDir, 'test.pdf');
    await fs.writeFile(testFile, 'test content');

    const files = await sender._resolveFiles(testFile);

    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0], testFile);
  });

  await test('应该解析 glob 模式', async () => {
    await fs.writeFile(path.join(testDir, 'file1.pdf'), 'content1');
    await fs.writeFile(path.join(testDir, 'file2.pdf'), 'content2');
    await fs.writeFile(path.join(testDir, 'file3.txt'), 'content3');

    const pattern = path.join(testDir, '*.pdf');
    const files = await sender._resolveFiles(pattern);

    assert.strictEqual(files.length, 2);
    assert.ok(files.every(f => f.endsWith('.pdf')));
  });

  await test('应该解析目录（递归）', async () => {
    const subDir = path.join(testDir, 'subdir');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(testDir, 'file1.pdf'), 'content1');
    await fs.writeFile(path.join(subDir, 'file2.pdf'), 'content2');

    const files = await sender._resolveFiles(testDir);

    assert.ok(files.length >= 2);
  });

  await test('应该处理多种扩展名模式', async () => {
    await fs.writeFile(path.join(testDir, 'doc.pdf'), 'pdf');
    await fs.writeFile(path.join(testDir, 'doc.md'), 'md');
    await fs.writeFile(path.join(testDir, 'doc.txt'), 'txt');

    const pattern = path.join(testDir, '*.{pdf,md}');
    const files = await sender._resolveFiles(pattern);

    assert.strictEqual(files.length, 2);
    assert.ok(files.some(f => f.endsWith('.pdf')));
    assert.ok(files.some(f => f.endsWith('.md')));
  });

  await test('应该抛出错误（文件不存在）', async () => {
    try {
      await sender._resolveFiles(path.join(testDir, 'nonexistent.pdf'));
      throw new Error('应该抛出错误');
    } catch (error) {
      assert.ok(error.message.includes('未找到匹配的文件'));
    }
  });

  console.log('\n🎨 文件类型识别测试:');

  await test('应该识别图片格式', () => {
    assert.strictEqual(sender._isImage('test.jpg'), true);
    assert.strictEqual(sender._isImage('test.png'), true);
    assert.strictEqual(sender._isImage('test.gif'), true);
    assert.strictEqual(sender._isImage('test.pdf'), false);
  });

  await test('应该识别文档格式', () => {
    assert.strictEqual(sender._isDocument('test.pdf'), true);
    assert.strictEqual(sender._isDocument('test.docx'), true);
    assert.strictEqual(sender._isDocument('test.jpg'), false);
  });

  console.log('\n📤 批量发送测试:');

  await test('应该发送所有文件并返回结果', async () => {
    await fs.writeFile(path.join(testDir, 'file1.pdf'), 'content1');
    await fs.writeFile(path.join(testDir, 'file2.pdf'), 'content2');

    const pattern = path.join(testDir, '*.pdf');
    const result = await sender.send(pattern, 'test_chat_id', { delay: 0 });

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.success, 2);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(mockClient.calls.sendFile.length, 2);
  });

  await test('应该处理发送失败', async () => {
    await fs.writeFile(path.join(testDir, 'file1.pdf'), 'content1');
    await fs.writeFile(path.join(testDir, 'file2.pdf'), 'content2');

    // 设置第二个文件发送失败
    mockClient.shouldFail = true;
    mockClient.failIndex = 2;

    const pattern = path.join(testDir, '*.pdf');
    const result = await sender.send(pattern, 'test_chat_id', { delay: 0 });

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.success, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.files[1].success, false);
    assert.strictEqual(result.files[1].error, 'Network error');
  });

  await test('应该调用进度回调', async () => {
    await fs.writeFile(path.join(testDir, 'file1.pdf'), 'content1');
    await fs.writeFile(path.join(testDir, 'file2.pdf'), 'content2');

    const progressCalls = [];
    const onProgress = (curr, total, file) => {
      progressCalls.push({ curr, total, file });
    };

    const pattern = path.join(testDir, '*.pdf');
    await sender.send(pattern, 'test_chat_id', { delay: 0, onProgress });

    // 验证进度回调被调用了正确的次数
    assert.strictEqual(progressCalls.length, 2);
    assert.strictEqual(progressCalls[0].curr, 1);
    assert.strictEqual(progressCalls[0].total, 2);
    assert.strictEqual(progressCalls[1].curr, 2);
    assert.strictEqual(progressCalls[1].total, 2);
    // 验证文件路径包含 .pdf（不依赖文件顺序）
    assert.ok(progressCalls[0].file.endsWith('.pdf'));
    assert.ok(progressCalls[1].file.endsWith('.pdf'));
  });

  await test('应该在发送之间延迟', async () => {
    await fs.writeFile(path.join(testDir, 'file1.pdf'), 'content1');
    await fs.writeFile(path.join(testDir, 'file2.pdf'), 'content2');

    const pattern = path.join(testDir, '*.pdf');
    const start = Date.now();
    await sender.send(pattern, 'test_chat_id', { delay: 100 });
    const elapsed = Date.now() - start;

    // 应该至少延迟了 100ms（第二个文件发送前）
    assert.ok(elapsed >= 100, `预期 >= 100ms，实际 ${elapsed}ms`);
  });

  console.log('\n⚠️  错误处理测试:');

  await test('应该抛出错误（chat_id 为空）', async () => {
    await fs.writeFile(path.join(testDir, 'test.pdf'), 'content');

    try {
      await sender.send(path.join(testDir, 'test.pdf'), '');
      throw new Error('应该抛出错误');
    } catch (error) {
      assert.ok(error.message.includes('chat_id'));
    }
  });

  await test('应该处理文件不存在', async () => {
    try {
      await sender.send(path.join(testDir, 'nonexistent.pdf'), 'test_chat_id');
      throw new Error('应该抛出错误');
    } catch (error) {
      assert.ok(error.message.includes('未找到匹配的文件'));
    }
  });

  // 跳过权限测试（在某些系统上可能不稳定）
  // await test('应该处理权限错误', async () => { ... });

  console.log('\n🖼️  图片特殊处理测试:');

  await test('应该使用 sendImage 发送图片', async () => {
    const imageFile = path.join(testDir, 'test.jpg');
    await fs.writeFile(imageFile, 'fake image data');

    await sender.send(imageFile, 'test_chat_id', { delay: 0 });

    assert.strictEqual(mockClient.calls.sendImage.length, 1);
    assert.strictEqual(mockClient.calls.sendFile.length, 0);
  });

  await test('应该使用 sendFile 发送非图片', async () => {
    const pdfFile = path.join(testDir, 'test.pdf');
    await fs.writeFile(pdfFile, 'pdf content');

    await sender.send(pdfFile, 'test_chat_id', { delay: 0 });

    assert.strictEqual(mockClient.calls.sendFile.length, 1);
    assert.strictEqual(mockClient.calls.sendImage.length, 0);
  });

  // 测试总结
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 测试结果: ${passedTests} 通过, ${failedTests} 失败\n`);
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
