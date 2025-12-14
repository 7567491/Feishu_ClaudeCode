/**
 * 上下文注入功能测试 (方案一: Prompt 前缀注入)
 *
 * 测试目标：
 * 1. getLightweightContext - 从消息历史中提取最近 N 条用户消息 + M 条助手回复
 * 2. formatContextPrefix - 将消息格式化为 prompt 前缀
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟数据库模块
vi.mock('../server/database/db.js', () => ({
  feishuDb: {
    getMessageHistory: vi.fn()
  }
}));

import { feishuDb } from '../server/database/db.js';
import {
  getLightweightContext,
  getRecentRounds,
  formatContextPrefix
} from '../server/lib/context-injection.js';

describe('Context Injection - 方案一', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLightweightContext', () => {

    it('应该返回最近 1 条用户消息 + 2 条助手回复', () => {
      // Arrange: 模拟数据库返回的消息历史（按时间正序，内容>=10字符）
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是旧用户消息1的内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '这是旧助手回复1的内容', message_type: 'text', created_at: '2024-01-01 10:01:00' },
        { id: 3, direction: 'incoming', content: '这是旧用户消息2的内容', message_type: 'text', created_at: '2024-01-01 10:02:00' },
        { id: 4, direction: 'outgoing', content: '这是旧助手回复2的内容', message_type: 'text', created_at: '2024-01-01 10:03:00' },
        { id: 5, direction: 'incoming', content: '这是最新用户消息的内容', message_type: 'text', created_at: '2024-01-01 10:04:00' },
        { id: 6, direction: 'outgoing', content: '这是最新助手回复1的内容', message_type: 'text', created_at: '2024-01-01 10:05:00' },
        { id: 7, direction: 'outgoing', content: '这是最新助手回复2的内容', message_type: 'text', created_at: '2024-01-01 10:06:00' },
      ]);

      // Act
      const result = getLightweightContext(123, 1, 2);

      // Assert
      expect(feishuDb.getMessageHistory).toHaveBeenCalledWith(123, 20);
      expect(result).toHaveLength(3);

      // 验证提取的是最近的消息
      expect(result[0]).toMatchObject({ role: 'user', content: '这是最新用户消息的内容' });
      expect(result[1]).toMatchObject({ role: 'assistant', content: '这是最新助手回复1的内容' });
      expect(result[2]).toMatchObject({ role: 'assistant', content: '这是最新助手回复2的内容' });
    });

    it('应该按时间排序返回消息', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是用户提出的一个问题内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '这是助手针对问题的回复内容', message_type: 'text', created_at: '2024-01-01 10:01:00' },
      ]);

      const result = getLightweightContext(123, 1, 1);  // 请求 1 用户 + 1 助手

      // 应该按时间顺序：用户消息在前，助手回复在后
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
    });

    it('消息不足时应该返回所有可用消息', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是唯一的用户消息内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
      ]);

      const result = getLightweightContext(123, 1, 2);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ role: 'user', content: '这是唯一的用户消息内容' });
    });

    it('空历史应该返回空数组', () => {
      feishuDb.getMessageHistory.mockReturnValue([]);

      const result = getLightweightContext(123, 1, 2);

      expect(result).toEqual([]);
    });

    it('应该过滤掉非文本消息', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是一条文本消息的内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: 'file.pdf', message_type: 'file', created_at: '2024-01-01 10:01:00' },
        { id: 3, direction: 'outgoing', content: '这是一条文本回复的内容', message_type: 'text', created_at: '2024-01-01 10:02:00' },
      ]);

      const result = getLightweightContext(123, 1, 2);

      expect(result).toHaveLength(2);
      expect(result.every(m => m.content !== 'file.pdf')).toBe(true);
    });

    it('应该过滤掉系统消息（如"收到"、错误信息、短内容）', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是用户提出的问题内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '收到', message_type: 'text', created_at: '2024-01-01 10:01:00' },
        { id: 3, direction: 'outgoing', content: 'Response sent', message_type: 'text', created_at: '2024-01-01 10:02:00' },
        { id: 4, direction: 'outgoing', content: '这是真正有价值的回复内容', message_type: 'text', created_at: '2024-01-01 10:03:00' },
      ]);

      const result = getLightweightContext(123, 1, 2);

      // 应该过滤掉 "收到" 和 "Response sent"（系统消息和短内容）
      expect(result.find(m => m.content === '收到')).toBeUndefined();
      expect(result.find(m => m.content === 'Response sent')).toBeUndefined();
      expect(result.find(m => m.content === '这是真正有价值的回复内容')).toBeDefined();
    });
  });

  describe('getRecentRounds - 完整轮次提取', () => {

    it('应该提取最近2轮完整对话（用户消息+对应助手回复）', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是第一轮用户的问题内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '这是第一轮助手的回复内容', message_type: 'text', created_at: '2024-01-01 10:01:00' },
        { id: 3, direction: 'incoming', content: '这是第二轮用户的问题内容', message_type: 'text', created_at: '2024-01-01 10:02:00' },
        { id: 4, direction: 'outgoing', content: '这是第二轮助手的回复内容', message_type: 'text', created_at: '2024-01-01 10:03:00' },
        { id: 5, direction: 'incoming', content: '这是第三轮用户的问题内容', message_type: 'text', created_at: '2024-01-01 10:04:00' },
        { id: 6, direction: 'outgoing', content: '这是第三轮助手的回复内容', message_type: 'text', created_at: '2024-01-01 10:05:00' },
      ]);

      const result = getRecentRounds(123, 2);

      // 应该返回最近2轮完整对话（4条消息）
      expect(result).toHaveLength(4);
      expect(result[0].content).toBe('这是第二轮用户的问题内容');
      expect(result[1].content).toBe('这是第二轮助手的回复内容');
      expect(result[2].content).toBe('这是第三轮用户的问题内容');
      expect(result[3].content).toBe('这是第三轮助手的回复内容');
    });

    it('用户消息没有对应助手回复时，只返回用户消息', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是第一轮用户的问题内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '这是第一轮助手的回复内容', message_type: 'text', created_at: '2024-01-01 10:01:00' },
        { id: 3, direction: 'incoming', content: '这是第二轮用户的问题内容', message_type: 'text', created_at: '2024-01-01 10:02:00' },
        // 第二轮没有助手回复
      ]);

      const result = getRecentRounds(123, 2);

      expect(result).toHaveLength(3);
      expect(result[2].content).toBe('这是第二轮用户的问题内容');
      expect(result[2].role).toBe('user');
    });

    it('只有1轮时请求2轮，应返回1轮', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是唯一一轮用户的问题内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '这是唯一一轮助手的回复内容', message_type: 'text', created_at: '2024-01-01 10:01:00' },
      ]);

      const result = getRecentRounds(123, 2);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
    });

    it('应该过滤系统消息后再匹配轮次', () => {
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '这是用户提出的问题内容', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '收到', message_type: 'text', created_at: '2024-01-01 10:00:30' },
        { id: 3, direction: 'outgoing', content: '这是助手针对问题的完整回复', message_type: 'text', created_at: '2024-01-01 10:01:00' },
      ]);

      const result = getRecentRounds(123, 1);

      // 应该跳过"收到"，匹配到真正的回复
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('这是用户提出的问题内容');
      expect(result[1].content).toBe('这是助手针对问题的完整回复');
    });

    it('空历史应该返回空数组', () => {
      feishuDb.getMessageHistory.mockReturnValue([]);

      const result = getRecentRounds(123, 2);

      expect(result).toEqual([]);
    });
  });

  describe('formatContextPrefix', () => {

    it('应该正确格式化消息为 prompt 前缀', () => {
      const messages = [
        { role: 'user', content: '什么是TDD?' },
        { role: 'assistant', content: 'TDD是测试驱动开发...' },
      ];
      const workingDir = '/home/ccp/project';
      const conversationId = 'group-oc_123';

      const result = formatContextPrefix(messages, workingDir, conversationId);

      // 验证包含必要的结构
      expect(result).toContain('[当前工作目录: /home/ccp/project]');
      expect(result).toContain('[会话ID: group-oc_123]');
      expect(result).toContain('最近对话上下文');
      expect(result).toContain('**用户**: 什么是TDD?');
      expect(result).toContain('**助手**: TDD是测试驱动开发...');
      expect(result).toContain('当前问题');
    });

    it('空消息数组应该只返回基本上下文', () => {
      const result = formatContextPrefix([], '/home/ccp', 'group-123');

      expect(result).toContain('[当前工作目录: /home/ccp]');
      expect(result).toContain('[会话ID: group-123]');
      expect(result).not.toContain('最近对话上下文');
    });

    it('应该处理包含特殊字符的消息', () => {
      const messages = [
        { role: 'user', content: '代码: `console.log("hello")`' },
        { role: 'assistant', content: '```js\nconsole.log("hello")\n```' },
      ];

      const result = formatContextPrefix(messages, '/home/ccp', 'test');

      expect(result).toContain('console.log');
      expect(result).toContain('```js');
    });

    it('应该截断过长的消息内容', () => {
      const longContent = 'a'.repeat(2000);
      const messages = [
        { role: 'user', content: longContent },
      ];

      const result = formatContextPrefix(messages, '/home/ccp', 'test');

      // 应该截断到合理长度（比如 500 字符）并添加省略号
      expect(result.length).toBeLessThan(longContent.length + 200);
      expect(result).toContain('...');
    });
  });

  describe('集成场景测试', () => {

    it('完整流程：获取上下文 + 格式化', () => {
      // 模拟真实场景的消息历史
      feishuDb.getMessageHistory.mockReturnValue([
        { id: 1, direction: 'incoming', content: '帮我写个Python脚本', message_type: 'text', created_at: '2024-01-01 10:00:00' },
        { id: 2, direction: 'outgoing', content: '收到', message_type: 'text', created_at: '2024-01-01 10:00:01' },
        { id: 3, direction: 'outgoing', content: '好的，我来帮你写一个Python脚本。\n\n```python\nprint("hello")\n```', message_type: 'text', created_at: '2024-01-01 10:01:00' },
      ]);

      // Act
      const context = getLightweightContext(123, 1, 2);
      const prefix = formatContextPrefix(context, '/home/project', 'group-test');

      // Assert
      expect(context).toHaveLength(2); // 1 用户消息 + 1 有效助手回复（过滤掉"收到"）
      expect(prefix).toContain('帮我写个Python脚本');
      expect(prefix).toContain('python');
      expect(prefix).not.toContain('收到'); // 确保系统消息被过滤
    });
  });
});
