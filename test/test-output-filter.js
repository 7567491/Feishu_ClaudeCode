/**
 * 测试智能输出过滤器
 */

import { ClaudeOutputFilter } from '../server/lib/filter-claude-output.js';

const filter = new ClaudeOutputFilter();

console.log('=== 智能输出过滤器测试 ===\n');

// 测试案例
const testCases = [
  {
    name: '正常对话',
    input: 'Hello! How can I help you today?',
    shouldKeep: true,
  },
  {
    name: '系统日志（应过滤）',
    input: '[FeishuClient] File message sent successfully',
    shouldKeep: false,
  },
  {
    name: 'JSON对象（应过滤或折叠）',
    input: '{\n  "receive_id": "chatId",\n  "content": "test"\n}',
    shouldKeep: true, // 会被折叠为摘要，这也是可接受的
  },
  {
    name: '代码片段（应过滤或折叠）',
    input: 'const result = await feishuClient.sendFile(chatId, filePath);\nif (result.success) {\n  console.log("sent");\n}',
    shouldKeep: true, // 会被折叠为摘要，这也是可接受的
  },
  {
    name: '错误堆栈（应美化）',
    input: 'Error: ENOENT: no such file or directory',
    shouldKeep: true, // 会被美化为友好消息
  },
  {
    name: 'Claude CLI 退出码（应美化）',
    input: 'Claude CLI exited with code 1',
    shouldKeep: true, // 会被美化
  },
  {
    name: '多行代码块（应折叠）',
    input: `function sendMessage() {
  const data = {
    receive_id: chatId,
    content: JSON.stringify({ text: "hello" }),
    msg_type: 'text'
  };
  return api.post('/send', data);
}`,
    shouldKeep: true, // 会被折叠为摘要
  },
  {
    name: 'console.log 语句（应过滤）',
    input: "console.log('[FeishuService] Processing message...');",
    shouldKeep: false,
  },
  {
    name: '函数定义（应过滤）',
    input: 'async function queryClaude(command, options) {',
    shouldKeep: false,
  },
  {
    name: '正常回复中带代码示例',
    input: '你可以使用 `npm install` 命令来安装依赖。',
    shouldKeep: true,
  },
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const filtered = filter.filter(testCase.input);
  const isKept = !!filtered;

  const status = isKept === testCase.shouldKeep ? '✅' : '❌';
  const result = isKept === testCase.shouldKeep ? 'PASS' : 'FAIL';

  if (result === 'PASS') {
    passed++;
  } else {
    failed++;
  }

  console.log(`${status} ${testCase.name}: ${result}`);
  console.log(`   输入: ${testCase.input.substring(0, 60)}${testCase.input.length > 60 ? '...' : ''}`);
  console.log(`   输出: ${filtered ? (filtered.substring(0, 60) + (filtered.length > 60 ? '...' : '')) : '(已过滤)'}`);
  console.log('');
}

// 统计信息
const stats = filter.getStats();
console.log('=== 过滤统计 ===');
console.log(`总测试数: ${testCases.length}`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`\n过滤器统计:`);
console.log(`  总过滤数: ${stats.totalFiltered}`);
console.log(`  代码块: ${stats.codeBlocksFiltered}`);
console.log(`  系统输出: ${stats.systemOutputFiltered}`);
console.log(`  错误美化: ${stats.errorsBeautified}`);

console.log(`\n${failed === 0 ? '✅ 所有测试通过' : '❌ 部分测试失败'}`);

process.exit(failed > 0 ? 1 : 0);
