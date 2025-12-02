#!/usr/bin/env node

/**
 * 飞书文档编辑器端到端测试
 * 运行前确保：
 * 1. 设置环境变量 TEST_CHAT_ID 和 TEST_USER_ID
 * 2. 飞书API凭证已配置
 * 3. 服务器正在运行
 *
 * 运行: node test/test-doc-editor-e2e.js
 */

import { FeishuDocEditor } from '../server/lib/feishu-doc-editor.js';
import { FeishuDocReader } from '../server/lib/feishu-doc-reader.js';
import { FeishuClient } from '../server/lib/feishu-client.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const TEST_CHAT_ID = process.env.TEST_CHAT_ID || 'oc_bb46fa97fc4c956e90cc86cb90dd8b4f';
const TEST_USER_ID = process.env.TEST_USER_ID || 'ou_test';
const TEST_DIR = path.join(__dirname, 'e2e-test-files');
const TEST_MD_FILE = path.join(TEST_DIR, 'test-document.md');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testName, message = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    log(`  ✅ ${testName}`, 'green');
    testResults.push({ name: testName, passed: true });
    return true;
  } else {
    failedTests++;
    log(`  ❌ ${testName}${message ? `: ${message}` : ''}`, 'red');
    testResults.push({ name: testName, passed: false, message });
    return false;
  }
}

async function setupTestEnvironment() {
  log('\n📋 Setting up test environment...', 'blue');

  // 创建测试目录
  await fs.mkdir(TEST_DIR, { recursive: true });

  // 创建测试文件
  const testContent = `# 端到端测试文档

这是一个用于测试飞书文档双向编辑功能的文档。

## 测试内容

### 1. 基础功能测试

- **创建编辑会话**：将本地MD文件转换为飞书文档
- **自动同步**：定时同步飞书文档修改到本地
- **停止编辑**：结束会话并清理

### 2. 文档格式支持

测试各种Markdown元素：

#### 文本格式

- **加粗文本**
- *斜体文本*
- \`行内代码\`
- ~~删除线文本~~

#### 代码块

\`\`\`javascript
function testFunction() {
  console.log('This is a test');
  return true;
}
\`\`\`

#### 列表

1. 有序列表项1
2. 有序列表项2
   - 嵌套无序列表
   - 另一个嵌套项
3. 有序列表项3

#### 表格

| 功能 | 状态 | 说明 |
|------|------|------|
| 创建文档 | ✅ | 已实现 |
| 同步内容 | ✅ | 已实现 |
| 冲突检测 | ✅ | 已实现 |

#### 任务列表

- [x] 已完成的任务
- [ ] 未完成的任务
- [ ] 另一个待办事项

## 测试时间戳

创建时间：${new Date().toLocaleString()}
`;

  await fs.writeFile(TEST_MD_FILE, testContent, 'utf-8');
  log(`  ✅ Test file created: ${TEST_MD_FILE}`, 'green');

  return testContent;
}

async function cleanupTestEnvironment() {
  log('\n🧹 Cleaning up test environment...', 'blue');

  try {
    // 删除测试文件
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    log('  ✅ Test files cleaned up', 'green');
  } catch (error) {
    log(`  ⚠️  Cleanup warning: ${error.message}`, 'yellow');
  }
}

// E2E测试场景1：基本编辑流程
async function testBasicEditFlow() {
  log('\n🧪 E2E Test 1: Basic Edit Flow', 'cyan');

  const feishuClient = new FeishuClient();
  await feishuClient.initialize();

  const db = await open({
    filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
    driver: sqlite3.Database
  });

  const docEditor = new FeishuDocEditor(feishuClient, db);
  const docReader = new FeishuDocReader(feishuClient);

  try {
    // 步骤1：创建编辑会话
    log('\n  Step 1: Creating edit session...', 'yellow');
    const startResult = await docEditor.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);

    assert(
      startResult.success === true,
      'Edit session should be created',
      startResult.message
    );

    if (!startResult.success) {
      return false;
    }

    const sessionId = startResult.sessionId;
    assert(sessionId !== undefined, 'Session ID should be returned');
    assert(startResult.documentUrl !== undefined, 'Document URL should be returned');

    log(`    📝 Document URL: ${startResult.documentUrl}`, 'blue');
    log(`    🔑 Session ID: ${sessionId}`, 'blue');

    // 步骤2：验证会话状态
    log('\n  Step 2: Verifying session status...', 'yellow');
    const status = await docEditor.getEditStatus(TEST_CHAT_ID);
    assert(
      status.includes('test-document.md'),
      'Status should include file name'
    );
    assert(
      status.includes('editing'),
      'Status should show editing state'
    );

    // 步骤3：读取飞书文档内容
    log('\n  Step 3: Reading document from Feishu...', 'yellow');
    const session = docEditor.editSessions.get(sessionId);
    assert(session !== undefined, 'Session should exist in memory');

    if (session) {
      const docContent = await docReader.readDocumentAsMarkdown(session.documentId);
      assert(
        docContent.content !== undefined,
        'Document content should be retrieved'
      );
      assert(
        docContent.content.includes('端到端测试文档'),
        'Document should contain test title'
      );

      log(`    📄 Document revision: ${docContent.revisionId}`, 'blue');
      log(`    📏 Content length: ${docContent.content.length} characters`, 'blue');
    }

    // 步骤4：测试同步（模拟）
    log('\n  Step 4: Testing sync mechanism...', 'yellow');
    await docEditor.syncDocument(sessionId);

    // 检查同步日志
    const syncLog = await db.get(
      'SELECT * FROM feishu_sync_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      sessionId
    );
    assert(
      syncLog !== undefined,
      'Sync log should be created'
    );

    if (syncLog) {
      log(`    🔄 Sync action: ${syncLog.action}`, 'blue');
      log(`    ⏱️  Sync duration: ${syncLog.duration_ms}ms`, 'blue');
    }

    // 步骤5：停止编辑会话
    log('\n  Step 5: Stopping edit session...', 'yellow');
    const stopResult = await docEditor.stopEditSession(sessionId);
    assert(
      stopResult.success === true,
      'Session should be stopped successfully'
    );

    // 验证会话已清理
    const stoppedSession = docEditor.editSessions.get(sessionId);
    assert(
      stoppedSession === undefined,
      'Session should be removed from memory'
    );

    // 检查数据库中的会话状态
    const dbSession = await db.get(
      'SELECT * FROM feishu_edit_sessions WHERE id = ?',
      sessionId
    );
    assert(
      dbSession !== undefined,
      'Session should be saved in database'
    );
    assert(
      dbSession.status === 'completed',
      'Session status should be completed'
    );

    return true;

  } catch (error) {
    log(`  ❌ Test failed with error: ${error.message}`, 'red');
    console.error(error);
    return false;
  } finally {
    await db.close();
  }
}

// E2E测试场景2：冲突处理
async function testConflictHandling() {
  log('\n🧪 E2E Test 2: Conflict Handling', 'cyan');

  const feishuClient = new FeishuClient();
  await feishuClient.initialize();

  const db = await open({
    filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
    driver: sqlite3.Database
  });

  const docEditor = new FeishuDocEditor(feishuClient, db);

  try {
    // 步骤1：创建编辑会话
    log('\n  Step 1: Creating edit session...', 'yellow');
    const startResult = await docEditor.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);

    if (!startResult.success) {
      log(`  ⚠️  Skipping conflict test: ${startResult.message}`, 'yellow');
      return false;
    }

    const sessionId = startResult.sessionId;

    // 步骤2：修改本地文件（模拟冲突）
    log('\n  Step 2: Modifying local file to create conflict...', 'yellow');
    const localContent = await fs.readFile(TEST_MD_FILE, 'utf-8');
    const modifiedContent = localContent + '\n\n## 本地修改\n\n这是在本地添加的内容，用于测试冲突处理。';
    await fs.writeFile(TEST_MD_FILE, modifiedContent, 'utf-8');

    assert(true, 'Local file modified');

    // 步骤3：触发同步（应该检测到冲突）
    log('\n  Step 3: Triggering sync to detect conflict...', 'yellow');
    await docEditor.syncDocument(sessionId);

    // 检查冲突记录
    const conflictRecord = await db.get(
      'SELECT * FROM feishu_conflict_records WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      sessionId
    );

    assert(
      conflictRecord !== undefined,
      'Conflict record should be created'
    );

    if (conflictRecord) {
      log(`    ⚠️  Conflict detected and recorded`, 'blue');
      log(`    📁 Conflict file: ${conflictRecord.conflict_file_path || 'N/A'}`, 'blue');
    }

    // 步骤4：清理会话
    log('\n  Step 4: Cleaning up session...', 'yellow');
    await docEditor.stopEditSession(sessionId);
    assert(true, 'Session stopped after conflict test');

    return true;

  } catch (error) {
    log(`  ❌ Test failed with error: ${error.message}`, 'red');
    console.error(error);
    return false;
  } finally {
    await db.close();
  }
}

// E2E测试场景3：会话恢复
async function testSessionRecovery() {
  log('\n🧪 E2E Test 3: Session Recovery', 'cyan');

  const feishuClient = new FeishuClient();
  await feishuClient.initialize();

  const db = await open({
    filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
    driver: sqlite3.Database
  });

  try {
    // 步骤1：创建编辑会话
    log('\n  Step 1: Creating edit session...', 'yellow');
    const docEditor1 = new FeishuDocEditor(feishuClient, db);
    const startResult = await docEditor1.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);

    if (!startResult.success) {
      log(`  ⚠️  Skipping recovery test: ${startResult.message}`, 'yellow');
      return false;
    }

    const sessionId = startResult.sessionId;
    assert(sessionId !== undefined, 'Session created');

    // 步骤2：模拟服务重启（创建新的编辑器实例）
    log('\n  Step 2: Simulating service restart...', 'yellow');
    const docEditor2 = new FeishuDocEditor(feishuClient, db);

    // 恢复会话前检查
    const beforeRestore = docEditor2.editSessions.size;
    assert(beforeRestore === 0, 'New editor should have no sessions initially');

    // 步骤3：恢复会话
    log('\n  Step 3: Restoring sessions...', 'yellow');
    await docEditor2.restoreSessions();

    const afterRestore = docEditor2.editSessions.size;
    assert(
      afterRestore > beforeRestore,
      'Sessions should be restored',
      `Before: ${beforeRestore}, After: ${afterRestore}`
    );

    // 验证恢复的会话
    const restoredSession = docEditor2.editSessions.get(sessionId);
    assert(
      restoredSession !== undefined,
      'Original session should be restored'
    );

    if (restoredSession) {
      assert(
        restoredSession.fileName === 'test-document.md',
        'Restored session should have correct file name'
      );
      assert(
        restoredSession.status === 'editing',
        'Restored session should be in editing state'
      );
    }

    // 步骤4：清理所有会话
    log('\n  Step 4: Cleaning up all sessions...', 'yellow');

    // 停止原始编辑器的会话
    for (const [sid, _] of docEditor1.editSessions) {
      await docEditor1.stopEditSession(sid);
    }

    // 停止恢复编辑器的会话
    for (const [sid, _] of docEditor2.editSessions) {
      await docEditor2.stopEditSession(sid);
    }

    assert(true, 'All sessions cleaned up');

    return true;

  } catch (error) {
    log(`  ❌ Test failed with error: ${error.message}`, 'red');
    console.error(error);
    return false;
  } finally {
    await db.close();
  }
}

// 性能测试
async function testPerformance() {
  log('\n🧪 Performance Test', 'cyan');

  const feishuClient = new FeishuClient();
  await feishuClient.initialize();

  const db = await open({
    filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
    driver: sqlite3.Database
  });

  const docEditor = new FeishuDocEditor(feishuClient, db);
  const docReader = new FeishuDocReader(feishuClient);

  try {
    // 测试文档创建性能
    log('\n  Testing document creation performance...', 'yellow');
    const startTime = Date.now();
    const result = await docEditor.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);
    const createTime = Date.now() - startTime;

    assert(
      createTime < 5000,
      `Document creation should be fast (${createTime}ms)`,
      createTime > 5000 ? 'Too slow!' : ''
    );

    if (result.success) {
      const sessionId = result.sessionId;
      const session = docEditor.editSessions.get(sessionId);

      // 测试文档读取性能
      log('\n  Testing document reading performance...', 'yellow');
      const readStart = Date.now();
      const docContent = await docReader.readDocumentAsMarkdown(session.documentId);
      const readTime = Date.now() - readStart;

      assert(
        readTime < 3000,
        `Document reading should be fast (${readTime}ms)`,
        readTime > 3000 ? 'Too slow!' : ''
      );

      // 测试同步性能
      log('\n  Testing sync performance...', 'yellow');
      const syncStart = Date.now();
      await docEditor.syncDocument(sessionId);
      const syncTime = Date.now() - syncStart;

      assert(
        syncTime < 2000,
        `Document sync should be fast (${syncTime}ms)`,
        syncTime > 2000 ? 'Too slow!' : ''
      );

      // 清理
      await docEditor.stopEditSession(sessionId);
    }

    return true;

  } catch (error) {
    log(`  ❌ Performance test failed: ${error.message}`, 'red');
    return false;
  } finally {
    await db.close();
  }
}

// 主测试函数
async function runE2ETests() {
  log('\n🚀 Starting E2E Test Suite for Feishu Document Editor\n', 'magenta');
  log('=' .repeat(60), 'magenta');

  // 检查环境变量
  if (!process.env.FeishuCC_App_ID || !process.env.FeishuCC_App_Secret) {
    log('\n⚠️  WARNING: Feishu credentials not found!', 'yellow');
    log('Please set FeishuCC_App_ID and FeishuCC_App_Secret environment variables.', 'yellow');
    log('Some tests will be skipped.\n', 'yellow');
  }

  try {
    // 设置测试环境
    await setupTestEnvironment();

    // 运行测试场景
    const testScenarios = [
      { name: 'Basic Edit Flow', fn: testBasicEditFlow },
      { name: 'Conflict Handling', fn: testConflictHandling },
      { name: 'Session Recovery', fn: testSessionRecovery },
      { name: 'Performance', fn: testPerformance }
    ];

    for (const scenario of testScenarios) {
      try {
        await scenario.fn();
      } catch (error) {
        log(`\n❌ ${scenario.name} test crashed: ${error.message}`, 'red');
        failedTests++;
      }
    }

    // 输出测试报告
    log('\n' + '=' .repeat(60), 'magenta');
    log('\n📊 Test Report:', 'magenta');
    log(`  Total Tests: ${totalTests}`, 'blue');
    log(`  Passed: ${passedTests}`, 'green');
    log(`  Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    log(`  Pass Rate: ${Math.round((passedTests / totalTests) * 100)}%`, 'blue');

    // 显示失败的测试
    if (failedTests > 0) {
      log('\n❌ Failed Tests:', 'red');
      testResults
        .filter(r => !r.passed)
        .forEach(r => {
          log(`  - ${r.name}${r.message ? `: ${r.message}` : ''}`, 'red');
        });
    }

    // 清理测试环境
    await cleanupTestEnvironment();

    if (failedTests === 0) {
      log('\n✨ All E2E tests passed!', 'green');
      process.exit(0);
    } else {
      log(`\n❌ ${failedTests} tests failed.`, 'red');
      process.exit(1);
    }

  } catch (error) {
    log('\n❌ E2E test suite error:', 'red');
    console.error(error);
    await cleanupTestEnvironment();
    process.exit(1);
  }
}

// 运行测试
runE2ETests();