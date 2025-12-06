/**
 * 测试 paper 指令检测逻辑
 *
 * 目标：验证 paper 指令是否能被正确检测
 */

// 模拟 cleanMentions 函数
function cleanMentions(text) {
  if (!text) return '';

  // Remove @user_name format (e.g., "@Bot ")
  let cleaned = text.replace(/@[^\s]+\s*/g, '');

  // Remove at-mention markers used by Feishu
  cleaned = cleaned.replace(/@_user_\d+/g, '');
  cleaned = cleaned.replace(/@_all/g, '');

  return cleaned.trim();
}

// 测试用例
const testCases = [
  { input: 'paper 推荐算法', expected: true, description: '纯paper指令' },
  { input: 'Paper 推荐算法', expected: true, description: '大写Paper' },
  { input: 'PAPER 推荐算法', expected: true, description: '全大写PAPER' },
  { input: '@Bot paper 推荐算法', expected: true, description: '带@提及的paper' },
  { input: '@_user_123 paper 推荐算法', expected: true, description: '带飞书@标记的paper' },
  { input: '  paper 推荐算法  ', expected: true, description: '带前后空格的paper' },
  { input: 'paper推荐算法', expected: false, description: '没有空格的paper（应该匹配失败）' },
  { input: '使用 paper 推荐算法', expected: false, description: 'paper不在开头' },
];

console.log('🧪 测试 paper 指令检测逻辑\n');

let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  // 模拟 feishu-ws.js 的处理流程
  const userText = cleanMentions(testCase.input);
  const trimmedText = userText.trim();
  const isPaperCommand = trimmedText.toLowerCase().startsWith('paper ');

  const passed = isPaperCommand === testCase.expected;

  console.log(`测试 ${index + 1}: ${testCase.description}`);
  console.log(`  输入: "${testCase.input}"`);
  console.log(`  清理后: "${userText}"`);
  console.log(`  trimmed: "${trimmedText}"`);
  console.log(`  检测结果: ${isPaperCommand}`);
  console.log(`  预期: ${testCase.expected}`);
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log();

  if (passed) {
    passCount++;
  } else {
    failCount++;
  }
});

console.log(`\n📊 测试结果: ${passCount} 通过 / ${failCount} 失败 / ${testCases.length} 总计`);

if (failCount > 0) {
  process.exit(1);
}
