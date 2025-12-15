/**
 * 飞书文件下载功能测试
 * TDD: 先写测试，再实现功能
 */

import { strict as assert } from 'assert';
import path from 'path';
import fs from 'fs';

// 模拟飞书消息数据
const mockFileMessage = {
  event: {
    message: {
      message_id: 'om_test_file_001',
      chat_id: 'oc_test_chat',
      chat_type: 'group',
      message_type: 'file',
      content: JSON.stringify({
        file_key: 'file_v3_test_key_001',
        file_name: 'test_document.pdf'
      })
    },
    sender: {
      sender_id: { open_id: 'ou_test_user' },
      sender_type: 'user'
    }
  }
};

const mockImageMessage = {
  event: {
    message: {
      message_id: 'om_test_image_001',
      chat_id: 'oc_test_chat',
      chat_type: 'p2p',
      message_type: 'image',
      content: JSON.stringify({
        image_key: 'img_v3_test_key_001'
      })
    },
    sender: {
      sender_id: { open_id: 'ou_test_user' },
      sender_type: 'user'
    }
  }
};

const mockTextMessage = {
  event: {
    message: {
      message_id: 'om_test_text_001',
      chat_id: 'oc_test_chat',
      chat_type: 'p2p',
      message_type: 'text',
      content: JSON.stringify({
        text: '你好'
      })
    },
    sender: {
      sender_id: { open_id: 'ou_test_user' },
      sender_type: 'user'
    }
  }
};

// ========== 测试辅助函数 ==========

/**
 * 解析消息类型和内容
 * @param {Object} messageEvent - 飞书消息事件
 * @returns {Object} - { type, content, fileKey?, fileName?, imageKey? }
 */
function parseMessageType(messageEvent) {
  const message = messageEvent.event?.message || messageEvent.message;
  if (!message) return null;

  const messageType = message.message_type;
  let parsedContent;

  try {
    parsedContent = JSON.parse(message.content);
  } catch {
    return null;
  }

  const result = {
    type: messageType,
    messageId: message.message_id,
    chatId: message.chat_id
  };

  switch (messageType) {
    case 'file':
      result.fileKey = parsedContent.file_key;
      result.fileName = parsedContent.file_name;
      break;
    case 'image':
      result.imageKey = parsedContent.image_key;
      break;
    case 'text':
      result.text = parsedContent.text;
      break;
  }

  return result;
}

/**
 * 检查是否为可下载的文件消息
 */
function isDownloadableMessage(parsed) {
  if (!parsed) return false;
  return parsed.type === 'file' || parsed.type === 'image';
}

/**
 * 生成保存文件的路径
 */
function generateSavePath(workingDir, parsed) {
  if (parsed.type === 'file') {
    return path.join(workingDir, parsed.fileName || 'unknown_file');
  } else if (parsed.type === 'image') {
    const timestamp = Date.now();
    return path.join(workingDir, `image_${timestamp}.png`);
  }
  return null;
}

// ========== 测试用例 ==========

async function testParseFileMessage() {
  console.log('测试1: 解析文件类型消息');

  const parsed = parseMessageType(mockFileMessage);

  assert(parsed !== null, '应该成功解析消息');
  assert.equal(parsed.type, 'file', '消息类型应为 file');
  assert.equal(parsed.fileKey, 'file_v3_test_key_001', '应正确提取 file_key');
  assert.equal(parsed.fileName, 'test_document.pdf', '应正确提取文件名');
  assert.equal(parsed.messageId, 'om_test_file_001', '应正确提取消息ID');

  console.log('  ✅ 文件消息解析正确');
  return true;
}

async function testParseImageMessage() {
  console.log('测试2: 解析图片类型消息');

  const parsed = parseMessageType(mockImageMessage);

  assert(parsed !== null, '应该成功解析消息');
  assert.equal(parsed.type, 'image', '消息类型应为 image');
  assert.equal(parsed.imageKey, 'img_v3_test_key_001', '应正确提取 image_key');

  console.log('  ✅ 图片消息解析正确');
  return true;
}

async function testParseTextMessage() {
  console.log('测试3: 解析文本类型消息');

  const parsed = parseMessageType(mockTextMessage);

  assert(parsed !== null, '应该成功解析消息');
  assert.equal(parsed.type, 'text', '消息类型应为 text');
  assert.equal(parsed.text, '你好', '应正确提取文本内容');

  console.log('  ✅ 文本消息解析正确');
  return true;
}

async function testIsDownloadableMessage() {
  console.log('测试4: 判断是否为可下载消息');

  const fileParsed = parseMessageType(mockFileMessage);
  const imageParsed = parseMessageType(mockImageMessage);
  const textParsed = parseMessageType(mockTextMessage);

  assert(isDownloadableMessage(fileParsed), '文件消息应可下载');
  assert(isDownloadableMessage(imageParsed), '图片消息应可下载');
  assert(!isDownloadableMessage(textParsed), '文本消息不应下载');
  assert(!isDownloadableMessage(null), 'null 不应下载');

  console.log('  ✅ 可下载判断逻辑正确');
  return true;
}

async function testGenerateSavePath() {
  console.log('测试5: 生成保存路径');

  const workingDir = '/home/ccp/feicc/test-session';
  const fileParsed = parseMessageType(mockFileMessage);
  const imageParsed = parseMessageType(mockImageMessage);

  const filePath = generateSavePath(workingDir, fileParsed);
  const imagePath = generateSavePath(workingDir, imageParsed);

  assert.equal(filePath, '/home/ccp/feicc/test-session/test_document.pdf', '文件路径应正确');
  assert(imagePath.startsWith('/home/ccp/feicc/test-session/image_'), '图片路径应正确');
  assert(imagePath.endsWith('.png'), '图片应有 .png 扩展名');

  console.log('  ✅ 保存路径生成正确');
  return true;
}

async function testFileDownloadHandler() {
  console.log('测试6: 验证文件下载处理器存在');

  // 检查 feishu-client.js 中的 downloadFile 方法
  const clientCode = fs.readFileSync('/home/ccp/server/lib/feishu-client.js', 'utf-8');

  assert(clientCode.includes('async downloadFile'), 'downloadFile 方法应存在');
  assert(clientCode.includes('async downloadImage'), 'downloadImage 方法应存在');
  assert(clientCode.includes('im.file.get'), '应使用飞书 file.get API');
  assert(clientCode.includes('im.image.get'), '应使用飞书 image.get API');

  console.log('  ✅ 底层下载 API 已实现');
  return true;
}

async function testWebhookIntegration() {
  console.log('测试7: 验证 Webhook 集成文件下载');

  const webhookCode = fs.readFileSync('/home/ccp/server/feishu-webhook.js', 'utf-8');

  // 检查是否有处理文件消息的逻辑
  const hasFileHandling = webhookCode.includes('message_type') &&
    (webhookCode.includes("'file'") || webhookCode.includes('"file"'));

  const hasImageHandling = webhookCode.includes("'image'") || webhookCode.includes('"image"');

  const hasDownloadCall = webhookCode.includes('downloadFile') || webhookCode.includes('downloadImage');

  if (!hasFileHandling || !hasImageHandling || !hasDownloadCall) {
    console.log('  ⚠️  Webhook 尚未集成文件下载功能');
    console.log(`    - 文件类型处理: ${hasFileHandling ? '✅' : '❌'}`);
    console.log(`    - 图片类型处理: ${hasImageHandling ? '✅' : '❌'}`);
    console.log(`    - 下载函数调用: ${hasDownloadCall ? '✅' : '❌'}`);
    // 这是预期会失败的测试，用于驱动开发
    throw new Error('Webhook 需要集成文件下载功能');
  }

  console.log('  ✅ Webhook 已集成文件下载');
  return true;
}

// ========== 运行测试 ==========

async function runTests() {
  console.log('='.repeat(60));
  console.log('飞书文件下载功能测试 (TDD)');
  console.log('='.repeat(60));
  console.log('');

  const tests = [
    testParseFileMessage,
    testParseImageMessage,
    testParseTextMessage,
    testIsDownloadableMessage,
    testGenerateSavePath,
    testFileDownloadHandler,
    testWebhookIntegration  // 这个测试应该失败，驱动我们实现功能
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
      console.log('');
    } catch (error) {
      failed++;
      console.log(`  ❌ 测试失败: ${error.message}`);
      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('');
    console.log('📝 TDD 下一步: 实现缺失的功能使测试通过');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// 导出辅助函数供实现使用
export { parseMessageType, isDownloadableMessage, generateSavePath };

runTests().catch(console.error);
