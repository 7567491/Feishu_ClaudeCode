#!/usr/bin/env node

/**
 * 设置飞书群聊的工作目录
 * Usage: node scripts/set-group-workdir.js "群名称" "/工作目录"
 */

import { FeishuClient } from '../server/lib/feishu-client.js';
import { feishuDb, initializeDatabase } from '../server/database/db.js';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log('Usage: node scripts/set-group-workdir.js "群名称" "/工作目录"');
    console.log('Example: node scripts/set-group-workdir.js "系统" "/home/dir"');
    process.exit(1);
  }

  const [groupName, workDir] = args;

  console.log(`设置群聊"${groupName}"的工作目录为: ${workDir}`);

  // Initialize database
  await initializeDatabase();

  // Initialize Feishu client
  const feishuClient = new FeishuClient({
    appId: process.env.FeishuCC_App_ID,
    appSecret: process.env.FeishuCC_App_Secret
  });

  // Get all active group sessions
  const sessions = feishuDb.prepare(`
    SELECT conversation_id, feishu_id, project_path
    FROM feishu_sessions
    WHERE session_type = 'group' AND is_active = 1
  `).all();

  console.log(`\n找到 ${sessions.length} 个活跃的群聊会话`);

  let targetSession = null;

  // Check each group's name
  for (const session of sessions) {
    const chatId = session.feishu_id;
    try {
      const chatInfo = await feishuClient.getChatInfo(chatId);
      console.log(`- ${chatInfo.name || '未命名'} (${chatId})`);

      if (chatInfo.name === groupName) {
        targetSession = session;
        console.log(`  ✅ 找到目标群聊！当前工作目录: ${session.project_path}`);
        break;
      }
    } catch (error) {
      console.log(`  ❌ 无法获取群聊信息: ${error.message}`);
    }
  }

  if (!targetSession) {
    console.error(`\n❌ 未找到名为"${groupName}"的群聊`);
    process.exit(1);
  }

  // Update the project_path
  const updateStmt = feishuDb.prepare(`
    UPDATE feishu_sessions
    SET project_path = ?, last_activity = CURRENT_TIMESTAMP
    WHERE conversation_id = ?
  `);

  const result = updateStmt.run(workDir, targetSession.conversation_id);

  if (result.changes > 0) {
    console.log(`\n✅ 成功更新群聊"${groupName}"的工作目录为: ${workDir}`);
    console.log(`   会话ID: ${targetSession.conversation_id}`);

    // Verify the update
    const updated = feishuDb.prepare(`
      SELECT project_path FROM feishu_sessions WHERE conversation_id = ?
    `).get(targetSession.conversation_id);

    console.log(`   验证: 新的工作目录为 ${updated.project_path}`);
  } else {
    console.error('\n❌ 更新失败');
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});