/**
 * 单元测试：FileSender 文件发送器
 *
 * 测试策略：
 * 1. 文件解析和匹配
 * 2. 文件验证
 * 3. 发送逻辑
 * 4. 错误处理
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { FileSender } from '../lib/file-sender.js';
import fs from 'fs';
import path from 'path';

// Mock FeishuClient
class MockFeishuClient {
  constructor() {
    this.sentFiles = [];
    this.shouldFail = false;
    this.failureRate = 0;
  }

  async sendFile(chatId, filePath) {
    if (this.shouldFail || Math.random() < this.failureRate) {
      throw new Error('Mock send failed');
    }
    this.sentFiles.push({ chatId, filePath, time: Date.now() });
    return {
      success: true,
      file_key: 'mock_key_' + Date.now()
    };
  }

  reset() {
    this.sentFiles = [];
    this.shouldFail = false;
    this.failureRate = 0;
  }
}

// 测试目录
const TEST_DIR = path.resolve(process.cwd(), '.test-file-sender-temp');

// 创建测试文件
function createTestFiles() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // 创建各种格式的测试文件
  fs.writeFileSync(path.join(TEST_DIR, 'test1.pdf'), 'PDF content');
  fs.writeFileSync(path.join(TEST_DIR, 'test2.pdf'), 'PDF content');
  fs.writeFileSync(path.join(TEST_DIR, 'doc.md'), '# Markdown');
  fs.writeFileSync(path.join(TEST_DIR, 'image.png'), 'PNG data');
  fs.writeFileSync(path.join(TEST_DIR, 'data.csv'), 'a,b,c');
  fs.writeFileSync(path.join(TEST_DIR, 'unsupported.xyz'), 'Unknown');

  // 创建子目录
  const subDir = path.join(TEST_DIR, 'subdir');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'nested.pdf'), 'Nested PDF');
}

// 清理测试文件
function cleanupTestFiles() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('FileSender', () => {
  let sender;
  let mockClient;

  beforeEach(() => {
    createTestFiles();
    mockClient = new MockFeishuClient();
    sender = new FileSender(mockClient);
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  describe('文件解析', () => {
    it('应该解析单个文件路径', async () => {
      const files = await sender._resolveFiles(path.join(TEST_DIR, 'test1.pdf'));
      assert.strictEqual(files.length, 1);
      assert.ok(files[0].endsWith('test1.pdf'));
    });

    it('应该解析 glob 模式 (*.pdf)', async () => {
      const files = await sender._resolveFiles(path.join(TEST_DIR, '*.pdf'));
      assert.strictEqual(files.length, 2);
      assert.ok(files.every(f => f.endsWith('.pdf')));
    });

    it('应该解析目录（递归）', async () => {
      const files = await sender._resolveFiles(TEST_DIR);
      // 应该包含所有支持格式的文件（排除 .xyz）
      assert.ok(files.length >= 5);
    });

    it('应该处理不存在的文件', async () => {
      await assert.rejects(
        async () => await sender._resolveFiles(path.join(TEST_DIR, 'nonexistent.pdf')),
        /未找到匹配的文件/
      );
    });

    it('应该解析混合 glob 模式 (*.{pdf,md})', async () => {
      const pattern = path.join(TEST_DIR, '*.{pdf,md}');
      const files = await sender._resolveFiles(pattern);
      assert.strictEqual(files.length, 3); // 2 PDF + 1 MD
    });
  });

  describe('文件验证', () => {
    it('应该验证文件存在性', () => {
      const validFile = path.join(TEST_DIR, 'test1.pdf');
      const invalidFile = path.join(TEST_DIR, 'nonexistent.pdf');

      assert.ok(sender._validateFile(validFile));
      assert.throws(() => sender._validateFile(invalidFile));
    });

    it('应该验证文件格式', () => {
      const supportedFile = path.join(TEST_DIR, 'test1.pdf');
      const unsupportedFile = path.join(TEST_DIR, 'unsupported.xyz');

      assert.ok(sender._isSupportedFormat(supportedFile));
      assert.ok(!sender._isSupportedFormat(unsupportedFile));
    });

    it('应该检测文件大小超限（如果实现）', () => {
      // 预留接口，未来可能需要限制文件大小
      const file = path.join(TEST_DIR, 'test1.pdf');
      const maxSize = 100 * 1024 * 1024; // 100MB
      assert.ok(sender._checkFileSize(file, maxSize));
    });
  });

  describe('发送逻辑', () => {
    it('应该发送单个文件', async () => {
      const file = path.join(TEST_DIR, 'test1.pdf');
      const result = await sender.send(file, 'test_chat_123');

      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.success, 1);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(mockClient.sentFiles.length, 1);
    });

    it('应该批量发送多个文件', async () => {
      const pattern = path.join(TEST_DIR, '*.pdf');
      const result = await sender.send(pattern, 'test_chat_123');

      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.success, 2);
      assert.strictEqual(mockClient.sentFiles.length, 2);
    });

    it('应该应用速率限制', async () => {
      const pattern = path.join(TEST_DIR, '*.pdf');
      const startTime = Date.now();

      await sender.send(pattern, 'test_chat_123', { delay: 500 });

      const elapsed = Date.now() - startTime;
      // 2 个文件，应该至少有 500ms 延迟
      assert.ok(elapsed >= 500);
    });

    it('应该处理发送失败', async () => {
      mockClient.shouldFail = true;

      const file = path.join(TEST_DIR, 'test1.pdf');
      const result = await sender.send(file, 'test_chat_123');

      assert.strictEqual(result.success, 0);
      assert.strictEqual(result.failed, 1);
    });

    it('应该统计成功和失败数量', async () => {
      mockClient.failureRate = 0.5; // 50% 失败率

      const pattern = path.join(TEST_DIR, '*.pdf');
      const result = await sender.send(pattern, 'test_chat_123');

      assert.strictEqual(result.total, 2);
      assert.ok(result.success + result.failed === 2);
    });
  });

  describe('进度报告', () => {
    it('应该调用进度回调', async () => {
      const progressEvents = [];

      const pattern = path.join(TEST_DIR, '*.pdf');
      await sender.send(pattern, 'test_chat_123', {
        onProgress: (current, total, file) => {
          progressEvents.push({ current, total, file });
        }
      });

      assert.strictEqual(progressEvents.length, 2);
      assert.strictEqual(progressEvents[0].current, 1);
      assert.strictEqual(progressEvents[1].current, 2);
    });
  });

  describe('错误处理', () => {
    it('应该提供清晰的错误信息', async () => {
      await assert.rejects(
        async () => await sender.send('/nonexistent/path/*.pdf', 'chat_123'),
        /未找到匹配的文件/
      );
    });

    it('应该处理无效的 chat_id', async () => {
      const file = path.join(TEST_DIR, 'test1.pdf');

      await assert.rejects(
        async () => await sender.send(file, ''),
        /无效的 chat_id/
      );
    });
  });

  describe('工具方法', () => {
    it('应该格式化文件大小', () => {
      assert.strictEqual(sender._formatSize(1024), '1.00 KB');
      assert.strictEqual(sender._formatSize(1024 * 1024), '1.00 MB');
      assert.strictEqual(sender._formatSize(500), '500 B');
    });

    it('应该检测所有支持的格式', () => {
      const formats = [
        'test.pdf', 'doc.md', 'img.png', 'data.csv',
        'slide.pptx', 'audio.mp3', 'video.mp4'
      ];

      formats.forEach(file => {
        assert.ok(sender._isSupportedFormat(file), `${file} should be supported`);
      });
    });
  });
});
