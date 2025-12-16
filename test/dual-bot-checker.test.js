/**
 * 双机器人群检测器测试
 */

import { strict as assert } from 'assert';

async function testDualBotChecker() {
  console.log('='.repeat(60));
  console.log('双机器人群检测器测试');
  console.log('='.repeat(60));
  console.log('');

  // 动态导入模块
  const { dualBotChecker } = await import('../server/lib/dual-bot-checker.js');

  // 测试1：初始化
  console.log('测试1: 初始化检测器');
  const initResult = await dualBotChecker.initialize();
  console.log(`  初始化结果: ${initResult ? '✅ 成功' : '❌ 失败'}`);

  // 测试2：获取统计信息
  console.log('\n测试2: 获取统计信息');
  const stats = dualBotChecker.getStats();
  console.log(`  已初始化: ${stats.initialized}`);
  console.log(`  小六群数: ${stats.xiaoliuGroupCount}`);
  console.log(`  AI初老师群数: ${stats.teacherGroupCount}`);
  console.log(`  双机器人群数: ${stats.dualBotGroupCount}`);
  console.log(`  上次刷新: ${stats.lastRefresh}`);

  // 测试3：验证已知的双机器人群
  console.log('\n测试3: 验证已知的双机器人群');
  const knownDualBotGroups = [
    'oc_77c58572eaee9e9df38884893c9c63ec',  // 磊哥的AI私教
    'oc_c59be7bdec815475bedc752e9a0b7932',  // Akam-AI开发
    'oc_eb2f5c4418fd953eb9e8c764e5e87a28'   // 可欣的AI私教
  ];

  for (const chatId of knownDualBotGroups) {
    const isDual = dualBotChecker.isDualBotGroup(chatId);
    console.log(`  ${chatId.substring(0, 20)}...: ${isDual ? '✅ 双机器人' : '❌ 非双机器人'}`);
    assert(isDual, `${chatId} 应该是双机器人群`);
  }

  // 测试4：验证单机器人群
  console.log('\n测试4: 验证单机器人群');
  const knownSingleBotGroups = [
    'oc_15a90daa813d981076ffa50c0de0b5e4',  // 会飞的CC-2 (当前群)
    'oc_952d27558236925146ef1cce0ead924b'   // 文献综述
  ];

  for (const chatId of knownSingleBotGroups) {
    const isDual = dualBotChecker.isDualBotGroup(chatId);
    console.log(`  ${chatId.substring(0, 20)}...: ${isDual ? '❌ 双机器人' : '✅ 单机器人'}`);
    assert(!isDual, `${chatId} 应该是单机器人群`);
  }

  // 测试5：列出所有双机器人群
  console.log('\n测试5: 双机器人群列表');
  console.log(`  共 ${stats.dualBotGroupCount} 个群:`);
  stats.dualBotGroups.forEach((chatId, i) => {
    console.log(`  ${i + 1}. ${chatId}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有测试通过');
  console.log('='.repeat(60));
}

testDualBotChecker().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
