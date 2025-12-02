/**
 * 飞书文档双向编辑 TDD 测试用例
 * 使用 ES6 模块语法
 */

import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sinon from 'sinon';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试数据目录
const TEST_DIR = path.join(__dirname, 'test-data');
const TEST_MD_FILE = path.join(TEST_DIR, 'test.md');

describe('飞书文档双向编辑功能 - TDD', function() {
  // 增加超时时间
  this.timeout(10000);

  before(async () => {
    // 创建测试目录
    await fs.mkdir(TEST_DIR, { recursive: true });

    // 创建测试用 MD 文件
    await fs.writeFile(TEST_MD_FILE, '# 测试文档\n\n这是测试内容。');
  });

  after(async () => {
    // 清理测试目录
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      console.error('清理测试目录失败:', e);
    }
  });

  describe('FeishuDocEditor - 编辑器核心功能', () => {
    let FeishuDocEditor;
    let docEditor;
    let mockFeishuClient;
    let mockDatabase;

    before(async () => {
      // 动态导入 FeishuDocEditor
      const module = await import('../server/lib/feishu-doc-editor.js');
      FeishuDocEditor = module.FeishuDocEditor;
    });

    beforeEach(() => {
      // 创建模拟对象
      mockFeishuClient = {
        createDocumentFromMarkdown: sinon.stub(),
        sendTextMessage: sinon.stub(),
        client: {
          docx: {
            document: {
              get: sinon.stub()
            }
          }
        }
      };

      mockDatabase = {
        run: sinon.stub().returns(Promise.resolve({ lastID: 1 })),
        get: sinon.stub().returns(Promise.resolve(null)),
        all: sinon.stub().returns(Promise.resolve([]))
      };

      docEditor = new FeishuDocEditor(mockFeishuClient, mockDatabase);
    });

    afterEach(() => {
      // 清理所有定时器
      if (docEditor && docEditor.editSessions) {
        for (const [_, session] of docEditor.editSessions) {
          if (session.syncTimer) {
            clearInterval(session.syncTimer);
          }
        }
      }
    });

    describe('命令解析', () => {
      it('应该正确解析 "编辑" 命令', () => {
        const result = docEditor.parseEditCommand('编辑 README.md');
        assert.deepEqual(result, {
          command: 'edit',
          fileName: 'README.md'
        });
      });

      it('应该正确解析 "edit" 命令（英文）', () => {
        const result = docEditor.parseEditCommand('edit docs/guide.md');
        assert.deepEqual(result, {
          command: 'edit',
          fileName: 'docs/guide.md'
        });
      });

      it('应该正确解析 "修改" 命令', () => {
        const result = docEditor.parseEditCommand('修改 test.md');
        assert.deepEqual(result, {
          command: 'edit',
          fileName: 'test.md'
        });
      });

      it('应该正确解析停止编辑命令', () => {
        assert.deepEqual(
          docEditor.parseEditCommand('停止编辑'),
          { command: 'stop_edit' }
        );
        assert.deepEqual(
          docEditor.parseEditCommand('stop edit'),
          { command: 'stop_edit' }
        );
        assert.deepEqual(
          docEditor.parseEditCommand('完成编辑'),
          { command: 'stop_edit' }
        );
      });

      it('应该正确解析状态查询命令', () => {
        assert.deepEqual(
          docEditor.parseEditCommand('编辑状态'),
          { command: 'edit_status' }
        );
        assert.deepEqual(
          docEditor.parseEditCommand('edit status'),
          { command: 'edit_status' }
        );
      });

      it('对非编辑命令应该返回 null', () => {
        assert.equal(docEditor.parseEditCommand('hello world'), null);
        assert.equal(docEditor.parseEditCommand('创建文件'), null);
      });
    });

    describe('编辑会话管理', () => {
      it('应该成功启动编辑会话', async () => {
        // 模拟飞书 API 响应
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        const result = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );

        assert.equal(result.success, true);
        assert.ok(result.sessionId);
        assert.equal(result.documentUrl, 'https://feishu.cn/docx/doc123');
        assert.ok(result.message.includes('文档编辑会话已创建'));
      });

      it('应该防止同一文件重复创建编辑会话', async () => {
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        // 第一次创建
        const result1 = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );
        assert.equal(result1.success, true);

        // 尝试重复创建
        const result2 = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );
        assert.equal(result2.success, false);
        assert.ok(result2.message.includes('该文件已在编辑中'));
      });

      it('应该能够停止编辑会话', async () => {
        // 先启动会话
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        const startResult = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );

        // 停止会话
        const stopResult = await docEditor.stopEditSession(startResult.sessionId);

        assert.equal(stopResult.success, true);
        assert.ok(stopResult.message.includes('编辑会话已结束'));
      });

      it('应该正确获取编辑状态', async () => {
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        // 启动会话
        await docEditor.startEditSession('chat123', TEST_MD_FILE, 'user123');

        // 获取状态
        const status = await docEditor.getEditStatus('chat123');

        assert.ok(status.includes('活跃的编辑会话'));
        assert.ok(status.includes('test.md'));
      });
    });
  });

  describe('FeishuDocReader - 文档读取和转换', () => {
    let FeishuDocReader;
    let docReader;
    let mockFeishuClient;

    before(async () => {
      // 动态导入 FeishuDocReader
      const module = await import('../server/lib/feishu-doc-reader.js');
      FeishuDocReader = module.FeishuDocReader;
    });

    beforeEach(() => {
      mockFeishuClient = {
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

      docReader = new FeishuDocReader(mockFeishuClient);
    });

    describe('文档块转换', () => {
      it('应该正确转换标题块', () => {
        const block = {
          block_type: 3, // heading1
          heading1: {
            elements: [{
              text_run: { content: '一级标题' }
            }]
          }
        };

        const { content } = docReader.blockToMarkdown(block);
        assert.equal(content, '# 一级标题');
      });

      it('应该正确转换文本块，包含格式', () => {
        const block = {
          block_type: 2, // text
          text: {
            elements: [
              { text_run: { content: '普通文本 ' } },
              { text_run: {
                content: '加粗文本',
                text_element_style: { bold: true }
              }},
              { text_run: { content: ' ' } },
              { text_run: {
                content: '斜体文本',
                text_element_style: { italic: true }
              }}
            ]
          }
        };

        const { content } = docReader.blockToMarkdown(block);
        assert.equal(content, '普通文本 **加粗文本** *斜体文本*');
      });

      it('应该正确转换列表块', () => {
        const bulletBlock = {
          block_type: 12, // bullet
          bullet: {
            elements: [{ text_run: { content: '无序列表项' } }]
          }
        };

        const orderedBlock = {
          block_type: 13, // ordered
          ordered: {
            elements: [{ text_run: { content: '有序列表项' } }]
          }
        };

        assert.equal(docReader.blockToMarkdown(bulletBlock).content, '- 无序列表项');
        assert.equal(docReader.blockToMarkdown(orderedBlock).content, '1. 有序列表项');
      });

      it('应该正确转换代码块', () => {
        const block = {
          block_type: 14, // code
          code: {
            style: { language: 'javascript' },
            elements: [{
              text_run: { content: 'console.log("Hello");' }
            }]
          }
        };

        const { content } = docReader.blockToMarkdown(block);
        assert.equal(content, '```javascript\nconsole.log("Hello");\n```');
      });

      it('应该正确转换引用块', () => {
        const block = {
          block_type: 15, // quote
          quote: {
            elements: [{ text_run: { content: '这是引用内容' } }]
          }
        };

        const { content } = docReader.blockToMarkdown(block);
        assert.equal(content, '> 这是引用内容');
      });
    });

    describe('完整文档读取', () => {
      it('应该成功读取并转换整个文档', async () => {
        // 模拟飞书 API 返回
        mockFeishuClient.client.docx.documentBlock.list.resolves({
          code: 0,
          data: {
            items: [
              { block_type: 1, block_id: 'page1' } // page block
            ]
          }
        });

        mockFeishuClient.client.docx.documentBlockChildren.list.resolves({
          code: 0,
          data: {
            items: [
              {
                block_type: 3,
                heading1: {
                  elements: [{ text_run: { content: '文档标题' } }]
                }
              },
              {
                block_type: 2,
                text: {
                  elements: [{ text_run: { content: '这是正文内容。' } }]
                }
              }
            ]
          }
        });

        mockFeishuClient.client.docx.document.get.resolves({
          code: 0,
          data: {
            document: {
              title: '测试文档',
              revision_id: 'rev123',
              update_time: '1234567890'
            }
          }
        });

        const result = await docReader.readDocumentAsMarkdown('doc123');

        assert.ok(result.content.includes('文档标题'));
        assert.ok(result.content.includes('这是正文内容'));
        assert.equal(result.revisionId, 'rev123');
        assert.equal(result.lastModified, '1234567890');
      });
    });
  });

  describe('同步和冲突处理', () => {
    let FeishuDocEditor, FeishuDocReader;
    let docEditor, docReader;
    let mockFeishuClient, mockDatabase;

    before(async () => {
      // 动态导入模块
      const editorModule = await import('../server/lib/feishu-doc-editor.js');
      const readerModule = await import('../server/lib/feishu-doc-reader.js');
      FeishuDocEditor = editorModule.FeishuDocEditor;
      FeishuDocReader = readerModule.FeishuDocReader;
    });

    beforeEach(() => {
      mockFeishuClient = {
        createDocumentFromMarkdown: sinon.stub(),
        sendTextMessage: sinon.stub(),
        client: {
          docx: {
            documentBlock: { list: sinon.stub() },
            documentBlockChildren: { list: sinon.stub() },
            document: { get: sinon.stub() }
          }
        }
      };

      mockDatabase = {
        run: sinon.stub().returns(Promise.resolve({ lastID: 1 })),
        get: sinon.stub().returns(Promise.resolve(null)),
        all: sinon.stub().returns(Promise.resolve([]))
      };

      docEditor = new FeishuDocEditor(mockFeishuClient, mockDatabase);
      docReader = new FeishuDocReader(mockFeishuClient);
    });

    afterEach(() => {
      // 清理所有定时器
      if (docEditor && docEditor.editSessions) {
        for (const [_, session] of docEditor.editSessions) {
          if (session.syncTimer) {
            clearInterval(session.syncTimer);
          }
        }
      }
    });

    describe('文档同步', () => {
      it('应该检测到远程文档的变化并同步', async () => {
        // 启动编辑会话
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        const { sessionId } = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );

        // 模拟远程文档被修改
        mockFeishuClient.client.docx.documentBlock.list.resolves({
          code: 0,
          data: {
            items: [{ block_type: 1, block_id: 'page1' }]
          }
        });

        mockFeishuClient.client.docx.documentBlockChildren.list.resolves({
          code: 0,
          data: {
            items: [{
              block_type: 2,
              text: { elements: [{ text_run: { content: '新内容' } }] }
            }]
          }
        });

        mockFeishuClient.client.docx.document.get.resolves({
          code: 0,
          data: {
            document: {
              revision_id: 'rev124', // 新版本
              update_time: Date.now()
            }
          }
        });

        // 执行同步
        await docEditor.syncDocument(sessionId);

        // 验证本地文件被更新
        const localContent = await fs.readFile(TEST_MD_FILE, 'utf-8');
        assert.ok(localContent.includes('新内容'));
      });
    });

    describe('冲突处理', () => {
      it('应该检测本地和远程的冲突', async () => {
        // 启动编辑会话
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        const { sessionId } = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );

        // 修改本地文件
        await fs.writeFile(TEST_MD_FILE, '# 本地修改的内容');

        // 模拟远程文档也被修改
        mockFeishuClient.client.docx.documentBlock.list.resolves({
          code: 0,
          data: {
            items: [{ block_type: 1, block_id: 'page1' }]
          }
        });

        mockFeishuClient.client.docx.documentBlockChildren.list.resolves({
          code: 0,
          data: {
            items: [{
              block_type: 3,
              heading1: {
                elements: [{ text_run: { content: '远程修改的内容' } }]
              }
            }]
          }
        });

        mockFeishuClient.client.docx.document.get.resolves({
          code: 0,
          data: {
            document: {
              revision_id: 'rev124',
              update_time: Date.now()
            }
          }
        });

        // 执行同步
        await docEditor.syncDocument(sessionId);

        // 验证冲突文件被创建
        const files = await fs.readdir(TEST_DIR);
        const conflictFile = files.find(f => f.includes('.conflict.'));
        assert.ok(conflictFile, '应该创建冲突文件');

        // 验证冲突通知被发送
        assert(mockFeishuClient.sendTextMessage.called, '应该发送冲突通知');
      });
    });

    describe('定时同步', () => {
      it('应该按设定间隔自动同步', async function() {
        // 设置短的同步间隔用于测试
        docEditor.syncInterval = 100; // 100ms

        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        const { sessionId } = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );

        // 监视同步方法
        const syncSpy = sinon.spy(docEditor, 'syncDocument');

        // 等待几个同步周期
        await new Promise(resolve => setTimeout(resolve, 350));

        // 验证同步被调用多次
        assert(syncSpy.callCount >= 3, `同步应该至少被调用3次，实际调用 ${syncSpy.callCount} 次`);

        // 停止会话
        await docEditor.stopEditSession(sessionId);
      });

      it('停止会话时应该清理定时器', async () => {
        mockFeishuClient.createDocumentFromMarkdown.resolves({
          document_id: 'doc123',
          url: 'https://feishu.cn/docx/doc123'
        });

        const { sessionId } = await docEditor.startEditSession(
          'chat123',
          TEST_MD_FILE,
          'user123'
        );

        const session = docEditor.editSessions.get(sessionId);
        assert.ok(session.syncTimer, '应该有同步定时器');

        await docEditor.stopEditSession(sessionId);

        // 验证定时器被清理
        assert.equal(session.syncTimer, null, '定时器应该被清理');
        assert.equal(docEditor.editSessions.has(sessionId), false, '会话应该被移除');
      });
    });
  });
});

// 如果直接运行此文件，执行测试
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('运行飞书文档双向编辑 TDD 测试...\n');
}