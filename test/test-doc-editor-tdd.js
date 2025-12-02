/**
 * 飞书文档双向编辑 TDD 测试用例
 * 使用 CommonJS 语法兼容性更好
 */

const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const sinon = require('sinon');
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

// 测试统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    log(`  ✅ ${message}`, 'green');
    return true;
  } else {
    failedTests++;
    log(`  ❌ ${message}`, 'red');
    return false;
  }
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

// 单元测试：命令解析
async function testCommandParsing() {
  log('\n🧪 Unit Test: Command Parsing', 'blue');

  const mockFeishuClient = {}; // 模拟对象
  const mockDatabase = {}; // 模拟对象
  const docEditor = new FeishuDocEditor(mockFeishuClient, mockDatabase);

  const testCases = [
    { input: '编辑 README.md', expected: { command: 'edit', fileName: 'README.md' } },
    { input: 'edit test.md', expected: { command: 'edit', fileName: 'test.md' } },
    { input: '修改 docs/guide.md', expected: { command: 'edit', fileName: 'docs/guide.md' } },
    { input: '在线编辑 file.md', expected: { command: 'edit', fileName: 'file.md' } },
    { input: '停止编辑', expected: { command: 'stop_edit' } },
    { input: 'stop edit', expected: { command: 'stop_edit' } },
    { input: '完成编辑', expected: { command: 'stop_edit' } },
    { input: '结束编辑', expected: { command: 'stop_edit' } },
    { input: 'finish edit', expected: { command: 'stop_edit' } },
    { input: '编辑状态', expected: { command: 'edit_status' } },
    { input: 'edit status', expected: { command: 'edit_status' } },
    { input: '查看编辑状态', expected: { command: 'edit_status' } },
    { input: 'random text', expected: null },
    { input: '编辑', expected: null }, // 没有文件名
    { input: 'edit test.txt', expected: null } // 不是.md文件
  ];

  for (const testCase of testCases) {
    const result = docEditor.parseEditCommand(testCase.input);
    const isMatch = JSON.stringify(result) === JSON.stringify(testCase.expected);
    assert(isMatch, `"${testCase.input}" -> ${JSON.stringify(result)}`);
  }
}

// 单元测试：会话管理
async function testSessionManagement() {
  log('\n🧪 Unit Test: Session Management', 'blue');

  const mockFeishuClient = {
    createDocumentFromMarkdown: async (title, content, options) => {
      return {
        document_id: 'test-doc-id',
        url: 'https://test.feishu.cn/docx/test-doc-id',
        revision_id: 1
      };
    }
  };

  // 打开数据库
  const db = await open({
    filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
    driver: sqlite3.Database
  });

  const docEditor = new FeishuDocEditor(mockFeishuClient, db);

  // 创建测试文件
  await setupTestFile();

  // 测试创建会话
  log('\n  Testing session creation...', 'yellow');
  const result = await docEditor.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);

  assert(result.success === true, 'Session should be created successfully');
  assert(result.sessionId !== undefined, 'Session ID should be returned');
  assert(result.documentUrl !== undefined, 'Document URL should be returned');

  // 测试会话查找
  log('\n  Testing session lookup...', 'yellow');
  const session = docEditor.editSessions.get(result.sessionId);
  assert(session !== undefined, 'Session should be found in memory');
  assert(session.chatId === TEST_CHAT_ID, 'Chat ID should match');
  assert(session.fileName === 'test-document.md', 'File name should match');

  // 测试重复创建同一文件的会话
  log('\n  Testing duplicate session prevention...', 'yellow');
  const duplicateResult = await docEditor.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);
  assert(duplicateResult.success === false, 'Duplicate session should be prevented');

  // 测试获取编辑状态
  log('\n  Testing edit status...', 'yellow');
  const status = await docEditor.getEditStatus(TEST_CHAT_ID);
  assert(status.includes('test-document.md'), 'Status should include file name');
  assert(status.includes(result.sessionId.slice(0, 8)), 'Status should include session ID (first 8 chars)');

  // 测试停止会话
  log('\n  Testing session stop...', 'yellow');
  const stopResult = await docEditor.stopEditSession(result.sessionId);
  assert(stopResult.success === true, 'Session should be stopped successfully');

  const stoppedSession = docEditor.editSessions.get(result.sessionId);
  assert(stoppedSession === undefined, 'Session should be removed from memory');

  await db.close();
}

// 单元测试：飞书文档读取器
async function testDocumentReader() {
  log('\n🧪 Unit Test: Document Reader', 'blue');

  const mockClient = {
    docx: {
      document: {
        get: async ({ path }) => {
          return {
            code: 0,
            data: {
              document: {
                title: 'Test Document',
                revision_id: 123,
                create_time: '1234567890',
                update_time: '1234567891'
              }
            }
          };
        }
      },
      documentBlock: {
        list: async ({ path, params }) => {
          return {
            code: 0,
            data: {
              items: [
                {
                  block_id: 'block1',
                  parent_id: '',
                  children: ['block2', 'block3'],
                  block_type: 3, // heading1
                  text: {
                    elements: [{ text_run: { content: 'Test Title' } }]
                  }
                },
                {
                  block_id: 'block2',
                  parent_id: 'block1',
                  children: [],
                  block_type: 2, // text
                  text: {
                    elements: [
                      { text_run: { content: 'Normal text with ' } },
                      { text_run: { content: 'bold', text_element_style: { bold: true } } },
                      { text_run: { content: ' and ' } },
                      { text_run: { content: 'italic', text_element_style: { italic: true } } }
                    ]
                  }
                }
              ],
              page_token: undefined
            }
          };
        },
        children: async ({ path, params }) => {
          if (params.parent_id === '') {
            return {
              code: 0,
              data: {
                items: [
                  {
                    block_id: 'block1',
                    parent_id: '',
                    children: ['block2'],
                    block_type: 3
                  }
                ]
              }
            };
          } else {
            return {
              code: 0,
              data: {
                items: [
                  {
                    block_id: 'block2',
                    parent_id: 'block1',
                    children: [],
                    block_type: 2
                  }
                ]
              }
            };
          }
        }
      }
    }
  };

  const mockFeishuClient = { client: mockClient };
  const docReader = new FeishuDocReader(mockFeishuClient);

  // 测试获取元数据
  log('\n  Testing metadata retrieval...', 'yellow');
  const metadata = await docReader.getDocumentMetadata('test-doc-id');
  assert(metadata.title === 'Test Document', 'Title should match');
  assert(metadata.revision_id === 123, 'Revision ID should match');

  // 测试获取文档块
  log('\n  Testing block retrieval...', 'yellow');
  const blocks = await docReader.getAllDocumentBlocks('test-doc-id');
  assert(blocks.length === 2, 'Should retrieve 2 blocks');
  assert(blocks[0].block_type === 3, 'First block should be heading');

  // 测试Markdown转换
  log('\n  Testing Markdown conversion...', 'yellow');
  const markdown = docReader.blocksToMarkdown(blocks);
  assert(markdown.includes('# Test Title'), 'Should convert heading');
  assert(markdown.includes('**bold**'), 'Should convert bold text');
  assert(markdown.includes('*italic*'), 'Should convert italic text');
}

// 集成测试：同步机制
async function testSyncMechanism() {
  log('\n🧪 Integration Test: Sync Mechanism', 'blue');

  // 这里需要真实的飞书客户端，所以只在有凭证时运行
  if (!process.env.FeishuCC_App_ID || !process.env.FeishuCC_App_Secret) {
    log('  ⚠️  Skipping sync test (no Feishu credentials)', 'yellow');
    return;
  }

  const feishuClient = new FeishuClient();
  await feishuClient.initialize();

  const db = await open({
    filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
    driver: sqlite3.Database
  });

  const docEditor = new FeishuDocEditor(feishuClient, db);
  const docReader = new FeishuDocReader(feishuClient);

  // 创建测试文件
  const originalContent = await setupTestFile();

  // 启动编辑会话
  log('\n  Starting edit session...', 'yellow');
  const result = await docEditor.startEditSession(TEST_CHAT_ID, TEST_MD_FILE, TEST_USER_ID);

  if (result.success) {
    const session = docEditor.editSessions.get(result.sessionId);

    // 读取飞书文档
    log('\n  Reading document from Feishu...', 'yellow');
    const docContent = await docReader.readDocumentAsMarkdown(session.documentId);
    assert(docContent.content !== undefined, 'Document content should be retrieved');

    // 测试同步
    log('\n  Testing sync...', 'yellow');
    await docEditor.syncDocument(result.sessionId);

    // 检查同步日志
    const syncLog = await db.get(
      'SELECT * FROM feishu_sync_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      result.sessionId
    );
    assert(syncLog !== undefined, 'Sync log should be created');

    // 清理
    await docEditor.stopEditSession(result.sessionId);
  }

  await db.close();
}

// 运行所有测试
async function runAllTests() {
  log('\n🚀 Starting TDD Test Suite for Feishu Document Editor\n', 'blue');
  log('=' .repeat(60), 'blue');

  try {
    // 单元测试
    await testCommandParsing();
    await testSessionManagement();
    await testDocumentReader();

    // 集成测试
    await testSyncMechanism();

    // 输出测试结果
    log('\n' + '=' .repeat(60), 'blue');
    log('\n📊 Test Results:', 'blue');
    log(`  Total Tests: ${totalTests}`, 'blue');
    log(`  Passed: ${passedTests}`, 'green');
    log(`  Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');

    if (failedTests === 0) {
      log('\n✨ All tests passed!', 'green');
      process.exit(0);
    } else {
      log(`\n❌ ${failedTests} tests failed.`, 'red');
      process.exit(1);
    }

  } catch (error) {
    log('\n❌ Test suite error:', 'red');
    console.error(error);
    process.exit(1);
  } finally {
    // 清理测试文件
    try {
      await fs.unlink(TEST_MD_FILE);
      log('\n🧹 Cleaned up test files', 'blue');
    } catch (error) {
      // 忽略清理错误
    }
  }
}

// 命令行参数处理
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
Usage: node test/test-doc-editor-tdd.js [options]

Options:
  --parse-only    Only run command parsing tests
  --session-only  Only run session management tests
  --reader-only   Only run document reader tests
  --sync-only     Only run sync mechanism tests
  --help          Show this help message
  `);
  process.exit(0);
}

// 根据参数运行特定测试
if (args.includes('--parse-only')) {
  testCommandParsing().then(() => {
    log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? 'green' : 'red');
    process.exit(failedTests > 0 ? 1 : 0);
  });
} else if (args.includes('--session-only')) {
  testSessionManagement().then(() => {
    log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? 'green' : 'red');
    process.exit(failedTests > 0 ? 1 : 0);
  });
} else if (args.includes('--reader-only')) {
  testDocumentReader().then(() => {
    log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? 'green' : 'red');
    process.exit(failedTests > 0 ? 1 : 0);
  });
} else if (args.includes('--sync-only')) {
  testSyncMechanism().then(() => {
    log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? 'green' : 'red');
    process.exit(failedTests > 0 ? 1 : 0);
  });
} else {
  // 运行所有测试
  runAllTests();
}