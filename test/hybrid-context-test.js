/**
 * 混合双保险上下文测试
 *
 * 测试目标：
 * 1. 验证数据库历史能正确提取
 * 2. 验证历史格式化为前缀
 * 3. 验证 --resume 和数据库历史同时工作
 */

import { ContextManager } from '../server/lib/context-manager.js';
import { feishuDb } from '../server/database/db.js';

describe('混合双保险上下文机制', () => {
  const contextManager = new ContextManager();

  test('测试上下文提取：至少5000字符', () => {
    // 模拟数据库返回的消息
    const mockMessages = [
      { direction: 'incoming', message_type: 'text', content: 'A'.repeat(2000) },
      { direction: 'outgoing', message_type: 'text', content: 'B'.repeat(1500) },
      { direction: 'incoming', message_type: 'text', content: 'C'.repeat(2000) },
      { direction: 'outgoing', message_type: 'text', content: 'D'.repeat(1000) }
    ];

    // Mock feishuDb.getMessageHistory
    feishuDb.getMessageHistory = jest.fn().mockReturnValue(mockMessages);

    const history = contextManager.extractContextFromDatabase(1);

    // 验证提取的消息
    expect(history.length).toBeGreaterThan(0);

    // 计算总字符数
    const totalChars = history.reduce((sum, msg) => sum + msg.content.length, 0);
    expect(totalChars).toBeGreaterThanOrEqual(5000);

    console.log('提取的消息数:', history.length);
    console.log('总字符数:', totalChars);
  });

  test('测试上下文提取：至少3条用户消息', () => {
    const mockMessages = [
      { direction: 'incoming', message_type: 'text', content: '用户消息1' },
      { direction: 'outgoing', message_type: 'text', content: '机器人回复1' },
      { direction: 'incoming', message_type: 'text', content: '用户消息2' },
      { direction: 'outgoing', message_type: 'text', content: '机器人回复2' },
      { direction: 'incoming', message_type: 'text', content: '用户消息3' },
      { direction: 'outgoing', message_type: 'text', content: '机器人回复3' }
    ];

    feishuDb.getMessageHistory = jest.fn().mockReturnValue(mockMessages);

    const history = contextManager.extractContextFromDatabase(1);
    const userMessageCount = history.filter(msg => msg.role === 'user').length;

    expect(userMessageCount).toBeGreaterThanOrEqual(3);
    console.log('用户消息数:', userMessageCount);
  });

  test('测试格式化为上下文前缀', () => {
    const messages = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮你的吗？' },
      { role: 'user', content: '今天天气怎么样？' },
      { role: 'assistant', content: '对不起，我无法实时查询天气信息。' }
    ];

    const formatted = contextManager.formatAsContextPrompt(messages);

    // 验证格式
    expect(formatted).toContain('# 对话历史上下文');
    expect(formatted).toContain('用户:');
    expect(formatted).toContain('助手:');
    expect(formatted).toContain('你好');
    expect(formatted).toContain('今天天气怎么样');

    console.log('格式化后的前缀长度:', formatted.length);
    console.log('前200个字符:', formatted.substring(0, 200));
  });

  test('测试混合上下文构建', () => {
    const mockMessages = [
      { direction: 'incoming', message_type: 'text', content: 'A'.repeat(2000) },
      { direction: 'outgoing', message_type: 'text', content: 'B'.repeat(2000) },
      { direction: 'incoming', message_type: 'text', content: 'C'.repeat(2000) }
    ];

    feishuDb.getMessageHistory = jest.fn().mockReturnValue(mockMessages);

    const hybridContext = contextManager.buildHybridContext(
      1,
      'session-abc123',
      '当前消息'
    );

    // 验证结构
    expect(hybridContext.useResume).toBe(true);
    expect(hybridContext.resumeSessionId).toBe('session-abc123');
    expect(hybridContext.databaseHistory.length).toBeGreaterThan(0);
    expect(hybridContext.currentMessage).toBe('当前消息');

    // 验证统计
    expect(hybridContext.stats.historyChars).toBeGreaterThan(5000);
    expect(hybridContext.stats.estimatedTokens).toBeGreaterThan(1500);

    console.log('混合上下文统计:', hybridContext.stats);
  });

  test('测试没有 resume 的情况', () => {
    const mockMessages = [
      { direction: 'incoming', message_type: 'text', content: '测试消息' },
      { direction: 'outgoing', message_type: 'text', content: '测试回复' }
    ];

    feishuDb.getMessageHistory = jest.fn().mockReturnValue(mockMessages);

    const hybridContext = contextManager.buildHybridContext(
      1,
      null,  // 没有 claude_session_id
      '当前消息'
    );

    expect(hybridContext.useResume).toBe(false);
    expect(hybridContext.resumeSessionId).toBe(null);
    expect(hybridContext.databaseHistory.length).toBeGreaterThan(0);

    console.log('无 resume 的混合上下文:', hybridContext);
  });
});

describe('集成测试：完整流程', () => {
  test('模拟真实对话流程', async () => {
    // 模拟 3 轮对话的数据库记录
    const mockHistory = [
      { direction: 'incoming', message_type: 'text', content: '我的名字是张三，请记住' },
      { direction: 'outgoing', message_type: 'text', content: '好的，我记住了你的名字是张三' },
      { direction: 'incoming', message_type: 'text', content: '我喜欢编程' },
      { direction: 'outgoing', message_type: 'text', content: '很好！编程是一项很有价值的技能' },
      { direction: 'incoming', message_type: 'text', content: '我的幸运数字是 42' },
      { direction: 'outgoing', message_type: 'text', content: '我记下了，你的幸运数字是 42' }
    ];

    feishuDb.getMessageHistory = jest.fn().mockReturnValue(mockHistory);

    const contextManager = new ContextManager();
    const hybridContext = contextManager.buildHybridContext(
      1,
      'session-test-123',
      '我的名字叫什么？'
    );

    // 验证提取的历史包含关键信息
    const formattedHistory = contextManager.formatAsContextPrompt(hybridContext.databaseHistory);

    expect(formattedHistory).toContain('张三');
    expect(formattedHistory).toContain('编程');
    expect(formattedHistory).toContain('42');

    // 验证统计
    expect(hybridContext.stats.historyMessageCount).toBe(6);

    console.log('✅ 完整流程测试通过');
    console.log('历史消息数:', hybridContext.stats.historyMessageCount);
    console.log('历史字符数:', hybridContext.stats.historyChars);
    console.log('估算 tokens:', hybridContext.stats.estimatedTokens);
  });
});
