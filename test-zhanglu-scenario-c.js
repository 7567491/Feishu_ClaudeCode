#!/usr/bin/env node
/**
 * 测试场景C：张璐专属群聊（无需@即可触发）
 */

import { db, feishuDb } from './server/database/db.js';

console.log('========================================');
console.log('测试场景C：张璐专属群聊检测');
console.log('========================================\n');

// 查找张璐的单人群聊（1个真人+1个机器人）
const zhangLuGroups = db.prepare(`
  SELECT
    chat_id,
    COUNT(*) as total_members,
    SUM(CASE WHEN member_type = 'user' THEN 1 ELSE 0 END) as user_count,
    SUM(CASE WHEN member_type = 'app' THEN 1 ELSE 0 END) as bot_count,
    GROUP_CONCAT(member_name || ' (' || member_type || ')') as members
  FROM feishu_group_members
  WHERE chat_id IN (
    SELECT chat_id FROM feishu_group_members
    WHERE member_name LIKE '%张璐%'
  )
  GROUP BY chat_id
  HAVING total_members = 2
`).all();

console.log(`找到 ${zhangLuGroups.length} 个包含张璐的双人群聊:\n`);

zhangLuGroups.forEach((group, index) => {
  console.log(`群聊 ${index + 1}: ${group.chat_id}`);
  console.log(`  总成员数: ${group.total_members}`);
  console.log(`  真实用户数: ${group.user_count}`);
  console.log(`  机器人数: ${group.bot_count}`);
  console.log(`  成员列表: ${group.members}`);

  // 检查是否符合场景C条件
  if (group.user_count === 1 && group.bot_count === 1) {
    console.log(`  ✅ 符合场景C条件：张璐专属群聊（无需@）`);
  } else if (group.user_count === 2 && group.bot_count === 0) {
    console.log(`  ❌ 不符合场景C：两个用户都被识别为user类型（需要修复）`);
  } else {
    console.log(`  ❓ 不符合场景C：成员类型识别可能有问题`);
  }
  console.log('');
});

// 显示修复建议
console.log('\n修复验证步骤:');
console.log('1. 在张璐的单人群聊中发送消息（不带@）');
console.log('2. 查看pm2 logs feishu，应该看到:');
console.log('   - "Member breakdown: 1 users, 1 bots/apps"');
console.log('   - "✨ 张璐专属群聊模式激活 - 无需@即可对话"');
console.log('3. 如果仍有问题，可能需要手动清理缓存:');
console.log('   sqlite3 server/database/auth.db "DELETE FROM feishu_group_members;"');
console.log('   然后重启服务让群成员信息重新加载');

db.close();