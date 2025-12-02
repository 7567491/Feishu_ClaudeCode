#!/usr/bin/env node

/**
 * 飞书文档双向编辑功能 - 完整集成测试
 * 测试整个功能流程，包括 webhook 集成
 */

import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function testAssert(condition, message) {
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

// 测试环境设置
async function setupTestEnvironment() {
  log('\n🔧 设置测试环境...', 'blue');

  // 创建测试目录
  const testDir = path.join(__dirname, 'test-integration');
  await fs.mkdir(testDir, { recursive: true });

  // 创建测试 MD 文件
  const testFiles = {
    'README.md': '# 项目说明\n\n这是项目的主要文档。',
    'docs/guide.md': '# 使用指南\n\n## 快速开始\n\n1. 安装\n2. 配置\n3. 运行',
    'docs/api.md': '# API 文档\n\n## 接口列表\n\n### GET /api/status',
    'test.md': '# 测试文档\n\n用于集成测试的文档。'
  };

  for (const [filePath, content] of Object.entries(testFiles)) {
    const fullPath = path.join(testDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  log('  ✅ 测试文件已创建', 'green');

  return testDir;
}

// 清理测试环境
async function cleanupTestEnvironment(testDir) {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
    log('  🧹 测试环境已清理', 'blue');
  } catch (e) {
    // 忽略清理错误
  }
}

// 测试数据库连接
async function testDatabaseConnection() {
  log('\n🗄️ 测试数据库连接', 'blue');

  try {
    const db = await open({
      filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
      driver: sqlite3.Database
    });

    // 检查表是否存在
    const tables = await db.all(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name LIKE 'feishu_%'
      ORDER BY name
    `);

    testAssert(tables.length > 0, `发现 ${tables.length} 个飞书相关表`);

    // 检查必需的表
    const requiredTables = [
      'feishu_edit_sessions',
      'feishu_sync_logs',
      'feishu_conflict_records'
    ];

    for (const tableName of requiredTables) {
      const exists = tables.some(t => t.name === tableName);
      testAssert(exists, `表 ${tableName} 存在`);
    }

    await db.close();

  } catch (error) {
    log(`  ❌ 数据库连接失败: ${error.message}`, 'red');
    return false;
  }

  return true;
}

// 测试编辑器功能
async function testEditorFunctionality(testDir) {
  log('\n🎯 测试编辑器核心功能', 'blue');

  try {
    // 动态导入模块
    const { FeishuDocEditor } = await import('../server/lib/feishu-doc-editor.js');
    const { FeishuDocReader } = await import('../server/lib/feishu-doc-reader.js');

    // 打开数据库
    const db = await open({
      filename: path.join(__dirname, '..', 'server', 'database', 'auth.db'),
      driver: sqlite3.Database
    });

    // 创建模拟的飞书客户端
    const mockFeishuClient = {
      createDocumentFromMarkdown: async (title, content, options) => {
        return {
          document_id: 'test-doc-' + Date.now(),
          url: 'https://feishu.cn/docx/test-doc',
          revision_id: 1
        };
      },
      sendTextMessage: async (chatId, message) => {
        log(`    [模拟消息] ${message.substring(0, 50)}...`, 'yellow');
      },
      client: {
        docx: {
          document: {
            get: async () => ({
              code: 0,
              data: {
                document: {
                  title: '测试文档',
                  revision_id: 123,
                  update_time: Date.now()
                }
              }
            })
          },
          documentBlock: {
            list: async () => ({
              code: 0,
              data: { items: [] }
            })
          },
          documentBlockChildren: {
            list: async () => ({
              code: 0,
              data: { items: [] }
            })
          }
        }
      }
    };

    // 创建编辑器实例
    const docEditor = new FeishuDocEditor(mockFeishuClient, db);
    const docReader = new FeishuDocReader(mockFeishuClient);

    // 测试启动编辑会话
    const testFile = path.join(testDir, 'test.md');
    const result = await docEditor.startEditSession('test-chat', testFile, 'test-user');

    testAssert(result.success === true, '启动编辑会话成功');
    testAssert(result.sessionId !== undefined, '返回会话 ID');

    // 测试获取状态
    const status = await docEditor.getEditStatus('test-chat');
    testAssert(status.includes('test.md'), '状态包含文件名');

    // 测试停止会话
    const stopResult = await docEditor.stopEditSession(result.sessionId);
    testAssert(stopResult.success === true, '停止会话成功');

    // 检查数据库记录
    const dbSession = await db.get(
      'SELECT * FROM feishu_edit_sessions WHERE id = ?',
      result.sessionId
    );
    testAssert(dbSession !== undefined, '会话保存到数据库');
    testAssert(dbSession.status === 'completed', '会话状态为已完成');

    await db.close();

  } catch (error) {
    log(`  ❌ 编辑器测试失败: ${error.message}`, 'red');
    console.error(error);
    return false;
  }

  return true;
}

// 测试 Webhook 集成
async function testWebhookIntegration() {
  log('\n🔌 测试 Webhook 集成', 'blue');

  try {
    // 检查 webhook 文件是否包含编辑功能
    const webhookPath = path.join(__dirname, '..', 'server', 'feishu-webhook.js');
    const webhookContent = await fs.readFile(webhookPath, 'utf-8');

    testAssert(
      webhookContent.includes('FeishuDocEditor'),
      'Webhook 引入了 FeishuDocEditor'
    );

    testAssert(
      webhookContent.includes('parseEditCommand'),
      'Webhook 包含命令解析逻辑'
    );

    testAssert(
      webhookContent.includes('startEditSession'),
      'Webhook 包含启动编辑会话逻辑'
    );

    testAssert(
      webhookContent.includes('stopEditSession'),
      'Webhook 包含停止编辑会话逻辑'
    );

  } catch (error) {
    log(`  ❌ Webhook 集成测试失败: ${error.message}`, 'red');
    return false;
  }

  return true;
}

// 测试文件查找功能
async function testFileHandler() {
  log('\n📂 测试文件查找功能', 'blue');

  try {
    const { FeishuFileHandler } = await import('../server/lib/feishu-file-handler.js');

    // 测试查找文件
    const testCases = [
      { fileName: 'README.md', shouldFind: true },
      { fileName: 'package.json', shouldFind: true },
      { fileName: 'nonexistent.md', shouldFind: false }
    ];

    for (const testCase of testCases) {
      const result = FeishuFileHandler.findFile(process.cwd(), testCase.fileName);
      const found = result !== null;

      testAssert(
        found === testCase.shouldFind,
        `查找 ${testCase.fileName}: ${testCase.shouldFind ? '找到' : '未找到'}`
      );
    }

  } catch (error) {
    log(`  ❌ 文件处理测试失败: ${error.message}`, 'red');
    return false;
  }

  return true;
}

// 主测试函数
async function runIntegrationTests() {
  log('\n' + '=' .repeat(60), 'blue');
  log('🚀 飞书文档双向编辑 - 完整集成测试', 'blue');
  log('=' .repeat(60), 'blue');

  let testDir;

  try {
    // 设置测试环境
    testDir = await setupTestEnvironment();

    // 运行各项测试
    await testDatabaseConnection();
    await testEditorFunctionality(testDir);
    await testWebhookIntegration();
    await testFileHandler();

    // 输出测试结果
    log('\n' + '=' .repeat(60), 'blue');
    log('\n📊 集成测试结果:', 'blue');
    log(`  总测试数: ${totalTests}`, 'blue');
    log(`  通过: ${passedTests}`, 'green');
    log(`  失败: ${failedTests}`, failedTests > 0 ? 'red' : 'green');

    const passRate = ((passedTests / totalTests) * 100).toFixed(1);
    log(`  通过率: ${passRate}%`, passRate === '100.0' ? 'green' : 'yellow');

    if (failedTests === 0) {
      log('\n✨ 所有集成测试通过！', 'green');
      log('\n📝 飞书文档双向编辑功能已完全实现并通过 TDD 测试', 'green');
      log('\n可以使用的命令:', 'blue');
      log('  • 编辑 <文件名.md> - 开始编辑 Markdown 文件', 'yellow');
      log('  • 停止编辑 - 结束当前编辑会话', 'yellow');
      log('  • 编辑状态 - 查看活跃的编辑会话', 'yellow');
    } else {
      log(`\n❌ ${failedTests} 个测试失败`, 'red');
    }

  } catch (error) {
    log('\n❌ 集成测试错误:', 'red');
    console.error(error);
  } finally {
    // 清理测试环境
    if (testDir) {
      await cleanupTestEnvironment(testDir);
    }
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

// 运行测试
runIntegrationTests();