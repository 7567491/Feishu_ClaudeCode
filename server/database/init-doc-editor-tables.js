#!/usr/bin/env node

/**
 * 初始化飞书文档编辑器数据库表
 * 运行: node server/database/init-doc-editor-tables.js
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeTables() {
  console.log('📦 Initializing Feishu Document Editor tables...');

  try {
    // 打开数据库连接
    const db = await open({
      filename: path.join(__dirname, 'auth.db'),
      driver: sqlite3.Database
    });

    console.log('✅ Connected to database');

    // 读取SQL schema文件
    const schemaPath = path.join(__dirname, 'feishu-doc-editor-schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    // 分割SQL语句并执行
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await db.exec(statement + ';');

        // 提取表名或视图名
        const tableMatch = statement.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
        const viewMatch = statement.match(/CREATE\s+VIEW\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
        const indexMatch = statement.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
        const triggerMatch = statement.match(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);

        if (tableMatch) {
          console.log(`✅ Created table: ${tableMatch[1]}`);
        } else if (viewMatch) {
          console.log(`✅ Created view: ${viewMatch[1]}`);
        } else if (indexMatch) {
          console.log(`✅ Created index: ${indexMatch[1]}`);
        } else if (triggerMatch) {
          console.log(`✅ Created trigger: ${triggerMatch[1]}`);
        }
      } catch (error) {
        console.error(`❌ Failed to execute statement:`, error.message);
        console.error('Statement:', statement.substring(0, 100) + '...');
      }
    }

    // 验证表是否创建成功
    console.log('\n🔍 Verifying tables...');

    const tables = [
      'feishu_edit_sessions',
      'feishu_sync_logs',
      'feishu_conflict_records',
      'feishu_doc_versions'
    ];

    for (const table of tables) {
      const result = await db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        table
      );

      if (result) {
        // 获取表的行数
        const count = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✅ Table ${table}: ${count.count} rows`);
      } else {
        console.log(`❌ Table ${table}: NOT FOUND`);
      }
    }

    // 验证视图
    console.log('\n🔍 Verifying views...');

    const views = [
      'active_edit_sessions',
      'sync_statistics'
    ];

    for (const view of views) {
      const result = await db.get(
        `SELECT name FROM sqlite_master WHERE type='view' AND name=?`,
        view
      );

      if (result) {
        console.log(`✅ View ${view}: OK`);
      } else {
        console.log(`❌ View ${view}: NOT FOUND`);
      }
    }

    // 关闭数据库连接
    await db.close();

    console.log('\n✨ Database initialization completed successfully!');

    // 提示下一步
    console.log('\n📝 Next steps:');
    console.log('1. Add FEISHU_DOC_SYNC_INTERVAL to .env (optional, default: 30000)');
    console.log('2. Restart the server to load the new modules');
    console.log('3. Test with: 编辑 README.md');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// 运行初始化
initializeTables().catch(console.error);