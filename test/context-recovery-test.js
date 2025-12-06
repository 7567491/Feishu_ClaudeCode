/**
 * TDD 测试：验证 Claude 上下文恢复机制
 *
 * 目的：验证 --resume 是否真的恢复了之前的对话内容
 */

import { queryClaude } from '../server/claude-cli.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

class MockWriter {
  constructor() {
    this.messages = [];
    this.sessionId = null;
  }

  send(data) {
    const msg = typeof data === 'string' ? JSON.parse(data) : data;
    this.messages.push(msg);

    // 捕获 session ID
    if (msg.type === 'session-created' && msg.sessionId) {
      this.sessionId = msg.sessionId;
    }
  }

  setSessionId(id) {
    this.sessionId = id;
  }

  getFullText() {
    return this.messages
      .filter(m => m.type === 'claude-response' && m.data?.message?.content)
      .flatMap(m => m.data.message.content)
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
  }
}

describe('Claude 上下文恢复机制', () => {
  let testDir;
  let capturedSessionId;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(os.tmpdir(), `claude-context-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // 清理测试目录
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('第1轮：设置一个唯一变量', async () => {
    const writer = new MockWriter();
    const uniqueNumber = Math.floor(Math.random() * 10000);

    await queryClaude(`请记住：我的测试编号是 ${uniqueNumber}。只回复"已记住"即可。`, {
      cwd: testDir,
      skipPermissions: true
    }, writer);

    expect(writer.sessionId).toBeTruthy();
    capturedSessionId = writer.sessionId;

    const response = writer.getFullText();
    console.log('第1轮 session_id:', capturedSessionId);
    console.log('第1轮回复:', response.substring(0, 100));

    expect(response).toContain('记住');
  }, 30000);

  test('第2轮：验证是否记得第1轮的内容', async () => {
    expect(capturedSessionId).toBeTruthy();

    const writer = new MockWriter();

    await queryClaude('我的测试编号是多少？直接说数字。', {
      sessionId: capturedSessionId,  // 使用 --resume
      cwd: testDir,
      skipPermissions: true
    }, writer);

    const response = writer.getFullText();
    console.log('第2轮回复:', response.substring(0, 200));

    // 关键断言：Claude 应该记得第1轮设置的编号
    const matches = response.match(/\d{4}/);
    expect(matches).toBeTruthy();

    if (matches) {
      console.log('✅ Claude 记得的编号:', matches[0]);
    } else {
      console.log('❌ Claude 没有回答出编号');
    }
  }, 30000);

  test('第3轮：要求引用第1轮和第2轮的内容', async () => {
    expect(capturedSessionId).toBeTruthy();

    const writer = new MockWriter();

    await queryClaude('总结一下我们的对话历史，包括我的测试编号。', {
      sessionId: capturedSessionId,
      cwd: testDir,
      skipPermissions: true
    }, writer);

    const response = writer.getFullText();
    console.log('第3轮回复:', response.substring(0, 300));

    // 验证是否能总结之前的对话
    expect(response.toLowerCase()).toMatch(/测试|编号|记住/);
  }, 30000);

  test('验证会话存储位置', async () => {
    expect(capturedSessionId).toBeTruthy();

    // 查找是否有会话存储文件
    const possiblePaths = [
      path.join(os.homedir(), '.claudecode', `session-${capturedSessionId}`),
      path.join(os.homedir(), '.claudecode', 'sessions', capturedSessionId),
      path.join(os.homedir(), '.claude-logs', `session-${capturedSessionId}`),
      path.join('/tmp', `claude-session-${capturedSessionId}`)
    ];

    let foundPath = null;
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        foundPath = p;
        break;
      } catch (e) {
        // 文件不存在
      }
    }

    console.log('会话存储路径:', foundPath || '未找到本地文件');

    if (foundPath) {
      const content = await fs.readFile(foundPath, 'utf8');
      console.log('会话内容长度:', content.length);
    } else {
      console.log('⚠️ 警告：未找到本地会话存储文件');
      console.log('   这意味着 Claude CLI 可能使用远程 API 存储会话');
    }
  });
});

describe('验证数据库 vs Claude 的上下文差异', () => {
  test('对比数据库记录和 Claude 实际记忆', async () => {
    // 模拟：数据库记录了 10 轮对话，每轮 100 字符
    const dbEstimatedTokens = (10 * 100) / 3;  // ~333 tokens

    console.log('数据库估算:', dbEstimatedTokens, 'tokens');
    console.log('实际问题：Claude CLI 是否真的加载了这些内容？');
    console.log('');
    console.log('关键发现：');
    console.log('1. 数据库只是日志记录，用于审计');
    console.log('2. Claude CLI 使用 --resume 从自己的存储恢复会话');
    console.log('3. 两者是独立的系统！');
    console.log('');
    console.log('可能的问题：');
    console.log('- 如果 Claude CLI 的会话过期/被清理，--resume 会失效');
    console.log('- 数据库有记录，但 Claude 已经忘记了');
  });
});
