#!/usr/bin/env node
/**
 * Send all .pdf files from a directory to Feishu chat
 *
 * Usage:
 *   node server/send-all-pdf.js <directory> <chat_id>
 *
 * Example:
 *   node server/send-all-pdf.js ./thinking-fast-slow-papers ou_xxx
 */

import { FeishuClient } from './lib/feishu-client.js';
import { credentialsDb, userDb, initializeDatabase } from './database/db.js';
import fs from 'fs';
import path from 'path';

async function sendAllPdfFiles() {
  try {
    console.log('📤 批量发送 PDF 文件工具\n');

    // Get arguments
    const directory = process.argv[2];
    const chatId = process.argv[3];

    if (!directory || !chatId) {
      console.error('❌ 参数错误');
      console.log('\n用法: node server/send-all-pdf.js <目录> <chat_id>');
      console.log('示例: node server/send-all-pdf.js ./thinking-fast-slow-papers ou_xxx\n');
      process.exit(1);
    }

    const absoluteDir = path.resolve(directory);
    console.log('📁 目录:', absoluteDir);
    console.log('💬 Chat ID:', chatId);
    console.log('');

    // Check if directory exists
    if (!fs.existsSync(absoluteDir)) {
      console.error(`❌ 目录不存在: ${absoluteDir}`);
      process.exit(1);
    }

    // Find all .pdf files
    const files = fs.readdirSync(absoluteDir)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => path.join(absoluteDir, f));

    if (files.length === 0) {
      console.log('⚠️  未找到 .pdf 文件');
      process.exit(0);
    }

    console.log(`找到 ${files.length} 个 PDF 文件:\n`);
    files.forEach((f, i) => {
      const stats = fs.statSync(f);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`  ${i + 1}. ${path.basename(f)} (${sizeMB} MB)`);
    });
    console.log('');

    // Initialize database
    await initializeDatabase();

    // Get credentials
    const user = userDb.getFirstUser();
    if (!user) {
      throw new Error('未找到用户');
    }

    let appId, appSecret;
    const credentialValue = credentialsDb.getActiveCredential(user.id, 'feishu');
    if (credentialValue) {
      const credentials = JSON.parse(credentialValue);
      appId = credentials.appId;
      appSecret = credentials.appSecret;
    } else {
      appId = process.env.FeishuCC_App_ID;
      appSecret = process.env.FeishuCC_App_Secret;
    }

    if (!appId || !appSecret) {
      throw new Error('未找到飞书凭证');
    }

    // Create client
    const client = new FeishuClient({ appId, appSecret });
    console.log('🔗 已连接飞书\n');

    // Send files
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = path.basename(file);

      try {
        console.log(`📤 [${i + 1}/${files.length}] 发送: ${fileName}...`);

        await client.sendFile(chatId, file);
        sent++;

        console.log(`   ✅ 成功`);

        // Small delay between files to avoid rate limiting
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

      } catch (error) {
        failed++;
        console.log(`   ❌ 失败: ${error.message}`);
      }
    }

    console.log(`\n📊 完成: ${sent} 成功, ${failed} 失败\n`);

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

sendAllPdfFiles();
