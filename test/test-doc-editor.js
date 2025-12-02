#!/usr/bin/env node

/**
 * 飞书文档编辑器功能测试
 * 运行: node test/test-doc-editor.js
 */

import { FeishuClient } from '../server/lib/feishu-client.js';
import { FeishuDocEditor } from '../server/lib/feishu-doc-editor.js';
import { FeishuDocReader } from '../server/lib/feishu-doc-reader.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const TEST_CHAT_ID = process.env.TEST_CHAT_ID || 'oc_test';
const TEST_USER_ID = process.env.TEST_USER_ID || 'ou_test';
const TEST_MD_FILE = path.join(__dirname, 'test-document.md');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function setupTestFile() {
  log('\n📝 Setting up test file...', 'blue');

  const testContent = `# Test Document

This is a test document for Feishu document editor.

## Features

- **Bold text** support
- *Italic text* support
- \`Inline code\` support

### Code Block

\`\`\`javascript
function test() {
  console.log('Hello, Feishu!');
}
\`\`\`

## Lists

1. First item
2. Second item
3. Third item

### Bullet List

- Item A
- Item B
  - Nested item
  - Another nested item

## Table

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

---

Last updated: ${new Date().toLocaleString()}
`;

  await fs.writeFile(TEST_MD_FILE, testContent, 'utf-8');
  log(`✅ Created test file: ${TEST_MD_FILE}`, 'green');

  return testContent;
}

async function testEditCommandParsing(docEditor) {
  log('\n🔍 Testing command parsing...', 'blue');

  const testCases = [
    { input: '编辑 README.md', expected: { command: 'edit', fileName: 'README.md' } },
    { input: 'edit test.md', expected: { command: 'edit', fileName: 'test.md' } },
    { input: '修改 docs/guide.md', expected: { command: 'edit', fileName: 'docs/guide.md' } },
    { input: '停止编辑', expected: { command: 'stop_edit' } },
    { input: 'stop edit', expected: { command: 'stop_edit' } },
    { input: '编辑状态', expected: { command: 'edit_status' } },
    { input: 'random text', expected: null }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = docEditor.parseEditCommand(testCase.input);
    const isMatch = JSON.stringify(result) === JSON.stringify(testCase.expected);

    if (isMatch) {
      log(`  ✅ "${testCase.input}" -> ${JSON.stringify(result)}`, 'green');
      passed++;
    } else {
      log(`  ❌ "${testCase.input}" -> Expected: ${JSON.stringify(testCase.expected)}, Got: ${JSON.stringify(result)}`, 'red');
      failed++;
    }
  }

  log(`\n📊 Command parsing: ${passed} passed, ${failed} failed`, failed > 0 ? 'red' : 'green');
}

async function testDocumentCreation(feishuClient, docEditor) {
  log('\n📄 Testing document creation and editing...', 'blue');

  try {
    // 1. 创建测试文档
    const testContent = await setupTestFile();

    // 2. 启动编辑会话
    log('\n  Starting edit session...', 'yellow');
    const result = await docEditor.startEditSession(
      TEST_CHAT_ID,
      TEST_MD_FILE,
      TEST_USER_ID
    );

    if (result.success) {
      log(`  ✅ Edit session created: ${result.sessionId}`, 'green');
      log(`  📝 Document URL: ${result.documentUrl}`, 'blue');

      // 3. 获取编辑状态
      log('\n  Getting edit status...', 'yellow');
      const status = await docEditor.getEditStatus(TEST_CHAT_ID);
      log(`  Status:\n${status}`, 'blue');

      // 4. 测试文档读取
      log('\n  Testing document reading...', 'yellow');
      const reader = new FeishuDocReader(feishuClient);
      const session = docEditor.editSessions.get(result.sessionId);

      if (session) {
        const docContent = await reader.readDocumentAsMarkdown(session.documentId);
        log(`  ✅ Document read successfully`, 'green');
        log(`  📖 Content length: ${docContent.content.length} characters`, 'blue');
        log(`  📖 Revision ID: ${docContent.revisionId}`, 'blue');

        // 比较内容（简单验证）
        const originalLines = testContent.split('\n').filter(l => l.trim());
        const retrievedLines = docContent.content.split('\n').filter(l => l.trim());

        if (originalLines.length === retrievedLines.length) {
          log(`  ✅ Line count matches: ${originalLines.length} lines`, 'green');
        } else {
          log(`  ⚠️  Line count mismatch: Original ${originalLines.length}, Retrieved ${retrievedLines.length}`, 'yellow');
        }
      }

      // 5. 停止编辑会话
      log('\n  Stopping edit session...', 'yellow');
      const stopResult = await docEditor.stopEditSession(result.sessionId);

      if (stopResult.success) {
        log(`  ✅ ${stopResult.message}`, 'green');
      } else {
        log(`  ❌ ${stopResult.message}`, 'red');
      }

      return true;

    } else {
      log(`  ❌ Failed to create edit session: ${result.message}`, 'red');
      return false;
    }

  } catch (error) {
    log(`  ❌ Error: ${error.message}`, 'red');
    console.error(error);
    return false;
  }
}

async function testConflictHandling(docEditor) {
  log('\n⚠️  Testing conflict handling...', 'blue');

  try {
    // 创建一个模拟会话
    const mockSession = {
      sessionId: 'test-conflict',
      chatId: TEST_CHAT_ID,
      fileName: 'test-conflict.md',
      localPath: path.join(__dirname, 'test-conflict.md'),
      lastSyncContent: 'Original content',
      originalContent: 'Original content',
      conflictCount: 0
    };

    const remoteContent = 'Remote changes\nLine 2';
    const localContent = 'Local changes\nLine 2';

    // 创建本地文件
    await fs.writeFile(mockSession.localPath, localContent, 'utf-8');

    // 测试冲突处理
    await docEditor.handleConflict(mockSession, remoteContent, localContent);

    // 检查冲突文件是否创建
    const conflictFiles = await fs.readdir(__dirname);
    const conflictFile = conflictFiles.find(f => f.includes('test-conflict.conflict'));

    if (conflictFile) {
      log(`  ✅ Conflict file created: ${conflictFile}`, 'green');

      // 读取冲突文件内容
      const conflictContent = await fs.readFile(
        path.join(__dirname, conflictFile),
        'utf-8'
      );

      if (conflictContent.includes('飞书文档版本') && conflictContent.includes('本地文件版本')) {
        log(`  ✅ Conflict file contains both versions`, 'green');
      }

      // 清理测试文件
      await fs.unlink(path.join(__dirname, conflictFile));
      await fs.unlink(mockSession.localPath);
    } else {
      log(`  ❌ Conflict file not created`, 'red');
    }

  } catch (error) {
    log(`  ❌ Conflict handling error: ${error.message}`, 'red');
  }
}

async function testDatabaseOperations() {
  log('\n💾 Testing database operations...', 'blue');

  try {
    const db = await open({
      filename: path.join(__dirname, '../server/database/auth.db'),
      driver: sqlite3.Database
    });

    // 检查表是否存在
    const tables = await db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'feishu_%'`
    );

    log(`  📊 Found ${tables.length} Feishu tables:`, 'blue');
    for (const table of tables) {
      const count = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
      log(`    - ${table.name}: ${count.count} rows`, 'green');
    }

    // 检查视图
    const views = await db.all(
      `SELECT name FROM sqlite_master WHERE type='view' AND name LIKE '%edit%'`
    );

    if (views.length > 0) {
      log(`  👁️  Found ${views.length} views:`, 'blue');
      for (const view of views) {
        log(`    - ${view.name}`, 'green');
      }
    }

    await db.close();
    return true;

  } catch (error) {
    log(`  ❌ Database error: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 Starting Feishu Document Editor Tests', 'blue');
  log('=' .repeat(50), 'blue');

  try {
    // 初始化数据库
    const db = await open({
      filename: path.join(__dirname, '../server/database/auth.db'),
      driver: sqlite3.Database
    });

    // 初始化飞书客户端
    const feishuClient = new FeishuClient();
    await feishuClient.initialize();

    // 初始化文档编辑器
    const docEditor = new FeishuDocEditor(feishuClient, db);

    // 运行测试
    await testEditCommandParsing(docEditor);
    await testDatabaseOperations();

    // 如果有真实的飞书凭证，运行完整测试
    if (process.env.FeishuCC_App_ID && process.env.FeishuCC_App_Secret) {
      log('\n🔑 Feishu credentials found, running full tests...', 'green');
      await testDocumentCreation(feishuClient, docEditor);
      await testConflictHandling(docEditor);
    } else {
      log('\n⚠️  No Feishu credentials found, skipping API tests', 'yellow');
      log('  Set FeishuCC_App_ID and FeishuCC_App_Secret to run full tests', 'yellow');
    }

    // 清理测试文件
    try {
      await fs.unlink(TEST_MD_FILE);
      log('\n🧹 Cleaned up test files', 'green');
    } catch (e) {
      // 忽略清理错误
    }

    await db.close();

    log('\n✨ All tests completed!', 'green');
    log('=' .repeat(50), 'green');

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(console.error);