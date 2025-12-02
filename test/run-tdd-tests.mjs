#!/usr/bin/env node

/**
 * 飞书文档双向编辑 TDD 测试
 * 使用 ES6 模块语法
 */

import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sinon from 'sinon';
import { FeishuDocEditor } from '../server/lib/feishu-doc-editor.js';
import { FeishuDocReader } from '../server/lib/feishu-doc-reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试数据目录
const TEST_DIR = path.join(__dirname, 'test-data');
const TEST_MD_FILE = path.join(TEST_DIR, 'test.md');

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

async function setup() {
  // 创建测试目录
  await fs.mkdir(TEST_DIR, { recursive: true });

  // 创建测试用 MD 文件
  const testContent = '# 测试文档\n\n这是测试内容。';
  await fs.writeFile(TEST_MD_FILE, testContent);

  log('✅ 测试环境准备完成', 'green');
}

async function cleanup() {
  // 清理测试目录
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    log('🧹 测试环境清理完成', 'blue');
  } catch (e) {
    console.error('清理测试目录失败:', e);
  }
}

// 测试命令解析
async function testCommandParsing() {
  log('\n🧪 测试命令解析功能', 'blue');

  const mockFeishuClient = {};
  const mockDatabase = {};
  const docEditor = new FeishuDocEditor(mockFeishuClient, mockDatabase);

  // 测试编辑命令
  testAssert(
    JSON.stringify(docEditor.parseEditCommand('编辑 README.md')) ===
    JSON.stringify({ command: 'edit', fileName: 'README.md' }),
    '解析"编辑 README.md"'
  );

  testAssert(
    JSON.stringify(docEditor.parseEditCommand('edit test.md')) ===
    JSON.stringify({ command: 'edit', fileName: 'test.md' }),
    '解析"edit test.md"'
  );

  testAssert(
    JSON.stringify(docEditor.parseEditCommand('修改 doc.md')) ===
    JSON.stringify({ command: 'edit', fileName: 'doc.md' }),
    '解析"修改 doc.md"'
  );

  // 测试停止命令
  testAssert(
    JSON.stringify(docEditor.parseEditCommand('停止编辑')) ===
    JSON.stringify({ command: 'stop_edit' }),
    '解析"停止编辑"'
  );

  testAssert(
    JSON.stringify(docEditor.parseEditCommand('stop edit')) ===
    JSON.stringify({ command: 'stop_edit' }),
    '解析"stop edit"'
  );

  // 测试状态命令
  testAssert(
    JSON.stringify(docEditor.parseEditCommand('编辑状态')) ===
    JSON.stringify({ command: 'edit_status' }),
    '解析"编辑状态"'
  );

  // 测试无效命令
  testAssert(
    docEditor.parseEditCommand('hello world') === null,
    '无效命令返回 null'
  );
}

// 测试会话管理
async function testSessionManagement() {
  log('\n🧪 测试会话管理功能', 'blue');

  const mockFeishuClient = {
    createDocumentFromMarkdown: sinon.stub().resolves({
      document_id: 'doc123',
      url: 'https://feishu.cn/docx/doc123'
    }),
    sendTextMessage: sinon.stub()
  };

  const mockDatabase = {
    run: sinon.stub().returns(Promise.resolve({ lastID: 1 })),
    get: sinon.stub().returns(Promise.resolve(null)),
    all: sinon.stub().returns(Promise.resolve([]))
  };

  const docEditor = new FeishuDocEditor(mockFeishuClient, mockDatabase);

  // 测试创建会话
  const result = await docEditor.startEditSession(
    'chat123',
    TEST_MD_FILE,
    'user123'
  );

  testAssert(result.success === true, '成功创建编辑会话');
  testAssert(result.sessionId !== undefined, '返回会话 ID');
  testAssert(result.documentUrl === 'https://feishu.cn/docx/doc123', '返回文档 URL');

  // 测试重复创建
  const duplicateResult = await docEditor.startEditSession(
    'chat123',
    TEST_MD_FILE,
    'user123'
  );

  testAssert(duplicateResult.success === false, '防止重复创建会话');
  testAssert(duplicateResult.message.includes('该文件已在编辑中'), '返回正确的错误信息');

  // 测试获取状态
  const status = await docEditor.getEditStatus('chat123');
  testAssert(status.includes('test.md'), '状态包含文件名');
  testAssert(status.includes('活跃的编辑会话'), '状态包含标题');

  // 测试停止会话
  const stopResult = await docEditor.stopEditSession(result.sessionId);
  testAssert(stopResult.success === true, '成功停止会话');

  // 清理定时器
  for (const [_, session] of docEditor.editSessions) {
    if (session.syncTimer) {
      clearInterval(session.syncTimer);
    }
  }
}

// 测试文档读取器
async function testDocumentReader() {
  log('\n🧪 测试文档读取器功能', 'blue');

  const mockFeishuClient = {
    client: {
      docx: {
        documentBlock: {
          list: sinon.stub().resolves({
            code: 0,
            data: {
              items: [{ block_type: 1, block_id: 'page1' }]
            }
          })
        },
        documentBlockChildren: {
          list: sinon.stub().resolves({
            code: 0,
            data: {
              items: [
                {
                  block_type: 3,
                  heading1: {
                    elements: [{ text_run: { content: '标题' } }]
                  }
                },
                {
                  block_type: 2,
                  text: {
                    elements: [
                      { text_run: { content: '普通文本 ' } },
                      { text_run: {
                        content: '加粗',
                        text_element_style: { bold: true }
                      }}
                    ]
                  }
                }
              ]
            }
          })
        },
        document: {
          get: sinon.stub().resolves({
            code: 0,
            data: {
              document: {
                title: '测试文档',
                revision_id: 'rev123',
                update_time: '1234567890'
              }
            }
          })
        }
      }
    }
  };

  const docReader = new FeishuDocReader(mockFeishuClient);

  // 测试块转换
  const headingBlock = {
    block_type: 3,
    heading1: {
      elements: [{ text_run: { content: '一级标题' } }]
    }
  };

  const { content: headingContent } = docReader.blockToMarkdown(headingBlock);
  testAssert(headingContent === '# 一级标题', '正确转换标题块');

  // 测试文本格式转换
  const textBlock = {
    block_type: 2,
    text: {
      elements: [
        { text_run: { content: '普通 ' } },
        { text_run: {
          content: '加粗',
          text_element_style: { bold: true }
        }},
        { text_run: { content: ' ' } },
        { text_run: {
          content: '斜体',
          text_element_style: { italic: true }
        }}
      ]
    }
  };

  const { content: textContent } = docReader.blockToMarkdown(textBlock);
  testAssert(textContent === '普通 **加粗** *斜体*', '正确转换文本格式');

  // 测试列表转换
  const bulletBlock = {
    block_type: 12,
    bullet: {
      elements: [{ text_run: { content: '列表项' } }]
    }
  };

  const { content: bulletContent } = docReader.blockToMarkdown(bulletBlock);
  testAssert(bulletContent === '- 列表项', '正确转换无序列表');

  // 测试代码块转换
  const codeBlock = {
    block_type: 14,
    code: {
      style: { language: 'javascript' },
      elements: [{ text_run: { content: 'console.log("test");' } }]
    }
  };

  const { content: codeContent } = docReader.blockToMarkdown(codeBlock);
  testAssert(
    codeContent === '```javascript\nconsole.log("test");\n```',
    '正确转换代码块'
  );

  // 测试完整文档读取
  const result = await docReader.readDocumentAsMarkdown('doc123');
  testAssert(result.content.includes('标题'), '文档包含标题');
  testAssert(result.content.includes('**加粗**'), '文档包含格式化文本');
  testAssert(result.revisionId === 'rev123', '正确返回版本 ID');
}

// 测试同步功能
async function testSyncFeature() {
  log('\n🧪 测试同步功能', 'blue');

  // 创建 mock 对象
  const mockFeishuClient = {
    createDocumentFromMarkdown: sinon.stub().resolves({
      document_id: 'doc123',
      url: 'https://feishu.cn/docx/doc123'
    }),
    sendTextMessage: sinon.stub(),
    client: {
      docx: {
        documentBlock: {
          list: sinon.stub()
        },
        documentBlockChildren: {
          list: sinon.stub()
        },
        document: {
          get: sinon.stub()
        }
      }
    }
  };

  const mockDatabase = {
    run: sinon.stub().returns(Promise.resolve({ lastID: 1 })),
    get: sinon.stub().returns(Promise.resolve(null)),
    all: sinon.stub().returns(Promise.resolve([]))
  };

  const docEditor = new FeishuDocEditor(mockFeishuClient, mockDatabase);

  // 设置短的同步间隔用于测试
  docEditor.syncInterval = 100; // 100ms

  // 启动编辑会话
  const { sessionId } = await docEditor.startEditSession(
    'chat123',
    TEST_MD_FILE,
    'user123'
  );

  // 监视同步方法
  const syncSpy = sinon.spy(docEditor, 'syncDocument');

  // 等待几个同步周期
  await new Promise(resolve => setTimeout(resolve, 350));

  testAssert(
    syncSpy.callCount >= 3,
    `定时同步至少执行 3 次 (实际: ${syncSpy.callCount})`
  );

  // 停止会话
  const stopResult = await docEditor.stopEditSession(sessionId);
  testAssert(stopResult.success === true, '成功停止会话');

  // 验证定时器被清理
  const session = docEditor.editSessions.get(sessionId);
  testAssert(session === undefined, '会话从内存中移除');
}

// 主测试函数
async function runTests() {
  log('\n🚀 开始运行飞书文档双向编辑 TDD 测试\n', 'blue');
  log('=' .repeat(60), 'blue');

  try {
    await setup();

    await testCommandParsing();
    await testSessionManagement();
    await testDocumentReader();
    await testSyncFeature();

    log('\n' + '=' .repeat(60), 'blue');
    log('\n📊 测试结果:', 'blue');
    log(`  总测试数: ${totalTests}`, 'blue');
    log(`  通过: ${passedTests}`, 'green');
    log(`  失败: ${failedTests}`, failedTests > 0 ? 'red' : 'green');

    if (failedTests === 0) {
      log('\n✨ 所有测试通过！', 'green');
    } else {
      log(`\n❌ ${failedTests} 个测试失败`, 'red');
    }

    await cleanup();

    process.exit(failedTests > 0 ? 1 : 0);

  } catch (error) {
    log('\n❌ 测试运行错误:', 'red');
    console.error(error);
    await cleanup();
    process.exit(1);
  }
}

// 运行测试
runTests();