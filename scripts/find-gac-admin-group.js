#!/usr/bin/env node

/**
 * 查找群聊名称为"GAC管理员"的群聊及其工作目录
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FeishuClient } from '../server/lib/feishu-client.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 手动加载环境变量
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// 初始化飞书客户端
const feishuClient = new FeishuClient({
  appId: process.env.FeishuCC_App_ID,
  appSecret: process.env.FeishuCC_App_Secret
});

// 数据库路径
const dbPath = path.join(__dirname, '../server/database/auth.db');

async function findGACAdminGroup() {
  const db = new sqlite3.Database(dbPath);

  try {
    // 查询所有群聊会话
    const groups = await new Promise((resolve, reject) => {
      db.all(
        `SELECT conversation_id, feishu_id, project_path, claude_session_id
         FROM feishu_sessions
         WHERE session_type = 'group' AND is_active = 1`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log(`找到 ${groups.length} 个群聊，开始查询群聊信息...`);

    // 遍历群聊，获取群聊信息
    for (const group of groups) {
      const chatId = group.feishu_id;
      console.log(`\n检查群聊: ${chatId}`);

      try {
        const chatInfo = await feishuClient.getChatInfo(chatId);
        if (chatInfo && chatInfo.name) {
          const chatName = chatInfo.name;
          console.log(`群聊名称: ${chatName}`);

          if (chatName === 'GAC管理员') {
            console.log('\n✅ 找到目标群聊！');
            console.log('='.repeat(50));
            console.log(`群聊名称: ${chatName}`);
            console.log(`群聊ID: ${chatId}`);
            console.log(`会话ID: ${group.conversation_id}`);
            console.log(`工作目录: ${group.project_path}`);
            console.log(`Claude会话ID: ${group.claude_session_id || '无'}`);
            console.log(`群聊描述: ${chatInfo.description || '无'}`);
            console.log(`群主: ${chatInfo.owner_id || '未知'}`);
            console.log('='.repeat(50));

            db.close();
            return;
          }
        }
      } catch (error) {
        console.log(`无法获取群聊信息: ${error.message}`);
      }
    }

    console.log('\n❌ 未找到名称为"GAC管理员"的群聊');

  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    db.close();
  }
}

// 运行查找
findGACAdminGroup().catch(console.error);