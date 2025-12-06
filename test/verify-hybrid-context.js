/**
 * 快速验证混合上下文功能
 */

import { contextManager } from '../server/lib/context-manager.js';
import { feishuDb } from '../server/database/db.js';

console.log('=== 混合上下文验证 ===\n');

// 使用真实的会话 ID 6 (319条消息的私聊会话)
const sessionId = 6;
const mockClaudeSessionId = 'test-session-123';

// 1. 测试数据库历史提取
console.log('📖 步骤 1: 从数据库提取历史');
const history = contextManager.extractContextFromDatabase(sessionId);
console.log(`   提取了 ${history.length} 条消息`);

// 2. 统计信息
const totalChars = history.reduce((sum, msg) => sum + (msg.content || '').length, 0);
const userCount = history.filter(msg => msg.role === 'user').length;
const assistantCount = history.filter(msg => msg.role === 'assistant').length;

console.log(`   总字符数: ${totalChars}`);
console.log(`   用户消息: ${userCount} 条`);
console.log(`   助手消息: ${assistantCount} 条`);
console.log(`   估算 tokens: ${Math.round(totalChars / 3)}`);

// 3. 验证最小条件
const meetsCharReq = totalChars >= 5000;
const meetsUserReq = userCount >= 3;
console.log(`\n✓ 字符数要求 (≥5000): ${meetsCharReq ? '✅' : '❌'} (${totalChars})`);
console.log(`✓ 用户消息要求 (≥3): ${meetsUserReq ? '✅' : '❌'} (${userCount})`);

// 4. 测试混合上下文构建
console.log('\n📦 步骤 2: 构建混合上下文');
const hybridContext = contextManager.buildHybridContext(
  sessionId,
  mockClaudeSessionId,
  '当前测试消息'
);

console.log(`   useResume: ${hybridContext.useResume}`);
console.log(`   resumeSessionId: ${hybridContext.resumeSessionId}`);
console.log(`   历史消息数: ${hybridContext.stats.historyMessageCount}`);
console.log(`   历史字符数: ${hybridContext.stats.historyChars}`);
console.log(`   估算 tokens: ${hybridContext.stats.estimatedTokens}`);

// 5. 测试格式化
console.log('\n📝 步骤 3: 格式化为上下文前缀');
const formatted = contextManager.formatAsContextPrompt(history);
const formattedLines = formatted.split('\n').length;
const formattedChars = formatted.length;

console.log(`   前缀总行数: ${formattedLines}`);
console.log(`   前缀字符数: ${formattedChars}`);
console.log(`\n前200个字符预览:`);
console.log(`   ${formatted.substring(0, 200).replace(/\n/g, '\n   ')}`);

// 6. 显示最近3条消息示例
console.log('\n📋 最近3条消息示例:');
history.slice(-3).forEach((msg, idx) => {
  const preview = msg.content.substring(0, 50).replace(/\n/g, ' ');
  console.log(`   ${idx + 1}. [${msg.role}] ${preview}${msg.content.length > 50 ? '...' : ''}`);
});

console.log('\n✅ 混合上下文功能验证完成\n');
