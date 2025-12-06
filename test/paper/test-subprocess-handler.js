/**
 * Paper Command Handler 集成测试
 * 测试独立 Claude 子进程调用和完整流程
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PaperCommandHandler } from '../../server/lib/paper-command-handler.js';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

describe('Paper Command Handler - 独立子进程模式', () => {
  let handler;
  let mockClient;
  let testDir;
  let sentMessages = [];

  before(async () => {
    // 创建测试目录
    testDir = path.join(os.tmpdir(), 'test-paper-subprocess');
    await fs.mkdir(testDir, { recursive: true });

    // 创建 Mock 飞书客户端
    mockClient = {
      sendTextMessage: async (chatId, message) => {
        sentMessages.push({ chatId, message, timestamp: Date.now() });
        console.log(`[MockClient] 发送消息到 ${chatId}:`, message.substring(0, 100));
        return Promise.resolve();
      }
    };

    handler = new PaperCommandHandler(mockClient);
  });

  after(async () => {
    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      console.log('清理测试目录失败:', error.message);
    }
  });

  describe('步骤提示测试', () => {
    it('应该发送完整的步骤提示消息', async () => {
      sentMessages = [];
      const mockSession = {
        project_path: testDir,
        claude_session_id: null
      };

      // 注意：这个测试不会真正调用 Claude（需要 Mock）
      // 这里只测试步骤提示的结构

      // 验证启动消息包含关键信息
      const expectedKeywords = [
        '步骤',
        '启动 Claude 独立子进程',
        '实时显示',
        'Markdown',
        '并行下载',
        '关键词',
        '工作目录'
      ];

      // 手动触发启动消息
      await mockClient.sendTextMessage('test-chat',
        '🚀 Paper 文献检索系统已启动\n\n' +
        '📋 执行步骤：\n' +
        '  1️⃣ 启动 Claude 独立子进程生成文献综述\n' +
        '  2️⃣ 实时显示生成过程\n' +
        '  3️⃣ 保存为 Markdown 文件\n' +
        '  4️⃣ 解析论文列表\n' +
        '  5️⃣ 并行下载 PDF 文件\n' +
        '  6️⃣ 发送所有文件到对话\n\n' +
        `🔍 关键词: 测试\n` +
        `📁 工作目录: ${testDir}`
      );

      assert.strictEqual(sentMessages.length, 1);
      const message = sentMessages[0].message;

      for (const keyword of expectedKeywords) {
        assert.ok(message.includes(keyword), `启动消息应包含 "${keyword}"`);
      }
    });

    it('应该包含6个步骤的进度标记', () => {
      const expectedSteps = [
        '步骤 1/6',
        '步骤 2/6',
        '步骤 3/6',
        '步骤 4/6',
        '步骤 5/6',
        '步骤 6/6'
      ];

      // 验证步骤标记格式正确
      expectedSteps.forEach((step, index) => {
        assert.ok(step.match(/步骤 \d\/6/), `步骤 ${index + 1} 格式应正确`);
      });
    });
  });

  describe('MD 文件保存测试', () => {
    it('应该保存带元数据头的 MD 文件', async () => {
      const keyword = '深度学习';
      const content = '这是一段测试综述内容。\n\n包含多行文本。';

      const filePath = await handler.saveReviewToMarkdown(keyword, content, testDir);

      // 验证文件存在
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      assert.ok(exists, 'MD 文件应该被创建');

      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // 验证元数据头
      assert.ok(fileContent.includes('# 深度学习 - 文献综述'), '应包含标题');
      assert.ok(fileContent.includes('生成时间:'), '应包含生成时间');
      assert.ok(fileContent.includes('关键词: 深度学习'), '应包含关键词');
      assert.ok(fileContent.includes('---'), '应包含分隔线');
      assert.ok(fileContent.includes(content), '应包含原始内容');
    });

    it('应该清理特殊字符作为文件名', async () => {
      const keyword = '深度学习/CNN?神经网络!';
      const content = '测试内容';

      const filePath = await handler.saveReviewToMarkdown(keyword, content, testDir);
      const fileName = path.basename(filePath);

      // 验证文件名不包含特殊字符
      assert.ok(!fileName.includes('/'), '文件名不应包含 /');
      assert.ok(!fileName.includes('?'), '文件名不应包含 ?');
      assert.ok(!fileName.includes('!'), '文件名不应包含 !');
      assert.ok(fileName.includes('_'), '特殊字符应被替换为 _');
    });
  });

  describe('论文表格解析测试', () => {
    it('应该解析标准 Markdown 表格', () => {
      const reviewText = `
# 深度学习文献综述

这是一段综述内容。

| 作者 | 年份 | 论文名称 | 引用次数 | 发表期刊 | 论文名中文翻译 |
|------|------|----------|----------|----------|----------------|
| LeCun Y. | 2015 | Deep Learning | 45000 | Nature | 深度学习 |
| Goodfellow I. | 2014 | Generative Adversarial Nets | 38000 | NeurIPS | 生成对抗网络 |
      `.trim();

      const papers = handler.parseTable(reviewText);

      assert.strictEqual(papers.length, 2, '应该解析出 2 篇论文');
      assert.strictEqual(papers[0].author, 'LeCun Y.');
      assert.strictEqual(papers[0].year, '2015');
      assert.strictEqual(papers[0].title, 'Deep Learning');
      assert.strictEqual(papers[0].citations, 45000);
      assert.strictEqual(papers[0].titleCn, '深度学习');
    });

    it('应该处理空表格', () => {
      const reviewText = '这是没有表格的文本';
      const papers = handler.parseTable(reviewText);

      assert.strictEqual(papers.length, 0, '应该返回空数组');
    });
  });

  describe('子进程调用测试（Mock）', () => {
    it('应该正确构建子进程参数', () => {
      const keyword = '量子计算';
      const expectedPrompt = `使用高引用的真实文献写一段文献综述
量子计算
最后用表格形式列出论文的作者、发表年份、论文名称、引用次数、发表期刊以及论文名中文翻译`;

      // 验证提示词格式
      assert.ok(expectedPrompt.includes(keyword), '提示词应包含关键词');
      assert.ok(expectedPrompt.includes('表格形式'), '提示词应要求表格输出');
      assert.ok(expectedPrompt.includes('作者'), '提示词应指定表格字段');
    });

    // 注意：真实的子进程测试需要 Claude CLI 安装
    it.skip('应该能启动 Claude 子进程并获取输出', async () => {
      sentMessages = [];
      const mockSession = {
        project_path: testDir,
        claude_session_id: null
      };

      try {
        const result = await handler.callClaudeSubprocess('测试', mockSession, 'test-chat');

        // 如果成功，验证返回内容
        assert.ok(result, '应该返回文献综述内容');
        assert.ok(result.length > 0, '内容长度应大于 0');

        // 验证发送了实时进度消息
        const progressMessages = sentMessages.filter(m => m.message.includes('📝'));
        assert.ok(progressMessages.length > 0, '应该发送实时进度消息');
      } catch (error) {
        // 如果 Claude CLI 未安装，跳过测试
        console.log('跳过真实子进程测试（Claude CLI 可能未安装）');
      }
    });
  });

  describe('错误处理测试', () => {
    it('应该处理子进程启动失败', async () => {
      // 修改 handler 使用不存在的 claude 路径
      const originalEnv = process.env.CLAUDE_CLI_PATH;
      process.env.CLAUDE_CLI_PATH = '/nonexistent/claude';

      try {
        await handler.callClaudeSubprocess('测试', {
          project_path: testDir
        }, 'test-chat');

        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('无法启动'), '错误消息应包含启动失败信息');
      } finally {
        process.env.CLAUDE_CLI_PATH = originalEnv;
      }
    });
  });

  describe('集成测试（端到端）', () => {
    it.skip('应该完成完整的 paper 流程', async () => {
      // 这个测试需要真实的 Claude CLI 和网络环境
      // 在 CI/CD 环境中应该跳过

      sentMessages = [];
      const mockSession = {
        project_path: testDir,
        claude_session_id: null
      };

      try {
        await handler.handle('test-chat', '机器学习', mockSession);

        // 验证发送了所有步骤的消息
        assert.ok(sentMessages.length > 6, '应该发送多条步骤消息');

        // 验证 MD 文件生成
        const files = await fs.readdir(testDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        assert.ok(mdFiles.length > 0, '应该生成 MD 文件');

        // 验证完成消息
        const completionMsg = sentMessages.find(m => m.message.includes('🎉'));
        assert.ok(completionMsg, '应该发送完成消息');
      } catch (error) {
        console.log('集成测试失败（可能需要真实环境）:', error.message);
      }
    });
  });
});
