#!/usr/bin/env node
/**
 * TDD测试：验证小六的飞书知识库权限
 *
 * 测试目标：
 * 1. 验证是否有 wiki:wiki 权限（创建/编辑知识库）
 * 2. 验证是否有 wiki:wiki:readonly 权限（读取知识库）
 * 3. 验证是否有 docx:document 权限（创建/编辑文档）- 已有
 * 4. 验证是否有 docx:document:readonly 权限（读取文档）
 * 5. 验证是否能创建知识库节点
 * 6. 验证是否能读取知识库列表
 */

import lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

// ANSI 颜色
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  test: (msg) => console.log(`${colors.blue}[测试]${colors.reset} ${msg}`),
  pass: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.yellow}ℹ${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.bold}${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`),
  error: (msg) => console.log(`${colors.red}[错误]${colors.reset} ${msg}`)
};

// 初始化飞书客户端
function initClient() {
  const appId = process.env.FeishuCC_App_ID;
  const appSecret = process.env.FeishuCC_App_Secret;

  if (!appId || !appSecret) {
    log.error('未找到飞书配置！请设置 FeishuCC_App_ID 和 FeishuCC_App_Secret 环境变量');
    process.exit(1);
  }

  log.info(`使用 App ID: ${appId.substring(0, 8)}...`);

  return new lark.Client({
    appId,
    appSecret,
    domain: lark.Domain.Feishu
  });
}

// 测试结果统计
const testResults = {
  total: 0,
  passed: 0,
  failed: 0
};

function recordTest(name, passed, error = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    log.pass(name);
  } else {
    testResults.failed++;
    log.fail(name);
    if (error) {
      log.error(`  ${error.message}`);
      if (error.code) {
        log.error(`  错误码: ${error.code}`);
      }
    }
  }
}

// 测试1: 验证文档创建权限（已有权限，作为基准）
async function test1_documentCreate(client) {
  log.section('测试1：验证文档创建权限 (docx:document)');

  try {
    const res = await client.docx.document.create({
      data: {
        title: '测试文档-权限验证-' + Date.now()
      }
    });

    if (res.code === 0) {
      const documentId = res.data.document.document_id;
      log.info(`文档创建成功！Document ID: ${documentId}`);
      log.info(`文档URL: https://feishu.cn/docx/${documentId}`);
      recordTest('创建文档权限 (docx:document)', true);

      // 返回文档ID用于后续测试
      return documentId;
    } else {
      recordTest('创建文档权限 (docx:document)', false, new Error(`${res.code} - ${res.msg}`));
      return null;
    }
  } catch (error) {
    recordTest('创建文档权限 (docx:document)', false, error);
    return null;
  }
}

// 测试2: 验证文档读取权限
async function test2_documentRead(client, documentId) {
  log.section('测试2：验证文档读取权限 (docx:document:readonly)');

  if (!documentId) {
    log.info('跳过测试（无可用文档ID）');
    return;
  }

  try {
    const res = await client.docx.documentRawContent.get({
      path: { document_id: documentId }
    });

    if (res.code === 0) {
      log.info('文档内容读取成功！');
      recordTest('读取文档权限 (docx:document:readonly)', true);
    } else {
      recordTest('读取文档权限 (docx:document:readonly)', false, new Error(`${res.code} - ${res.msg}`));
    }
  } catch (error) {
    recordTest('读取文档权限 (docx:document:readonly)', false, error);
  }
}

// 测试3: 验证知识库列表读取权限
async function test3_wikiList(client) {
  log.section('测试3：验证知识库列表读取权限 (wiki:wiki:readonly)');

  try {
    const res = await client.wiki.space.list({
      params: { page_size: 10 }
    });

    if (res.code === 0) {
      const count = res.data?.items?.length || 0;
      log.info(`成功获取知识库列表！共 ${count} 个知识库`);

      if (count > 0) {
        log.info('知识库示例:');
        res.data.items.slice(0, 3).forEach((space, i) => {
          log.info(`  ${i + 1}. ${space.name || '未命名'} (ID: ${space.space_id})`);
        });
      }

      recordTest('读取知识库列表权限 (wiki:wiki:readonly)', true);
      return res.data?.items || [];
    } else {
      recordTest('读取知识库列表权限 (wiki:wiki:readonly)', false, new Error(`${res.code} - ${res.msg}`));
      return [];
    }
  } catch (error) {
    recordTest('读取知识库列表权限 (wiki:wiki:readonly)', false, error);
    return [];
  }
}

// 测试4: 验证知识库节点创建权限
async function test4_wikiNodeCreate(client, spaces) {
  log.section('测试4：验证知识库节点创建权限 (wiki:wiki)');

  if (!spaces || spaces.length === 0) {
    log.info('跳过测试（无可用知识库）');
    log.info('提示：需要先创建知识库，或确保应用已被添加到知识库');
    return;
  }

  // 使用第一个知识库进行测试
  const spaceId = spaces[0].space_id;
  log.info(`使用知识库: ${spaces[0].name || '未命名'} (${spaceId})`);

  try {
    // 先创建一个测试文档
    log.test('创建测试文档...');
    const docRes = await client.docx.document.create({
      data: {
        title: '知识库节点测试-' + Date.now()
      }
    });

    if (docRes.code !== 0) {
      recordTest('创建知识库节点权限 (wiki:wiki)', false, new Error('无法创建测试文档'));
      return;
    }

    const documentId = docRes.data.document.document_id;
    log.info(`测试文档创建成功: ${documentId}`);

    // 尝试将文档添加到知识库
    log.test('将文档添加到知识库...');
    const nodeRes = await client.wiki.spaceNode.create({
      path: { space_id: spaceId },
      data: {
        obj_type: 'docx',
        obj_token: documentId,
        title: '知识库节点测试-' + Date.now(),
        node_type: 'origin'
      }
    });

    if (nodeRes.code === 0) {
      const nodeToken = nodeRes.data?.node?.node_token;
      log.info(`知识库节点创建成功！Node Token: ${nodeToken}`);
      log.info(`节点URL: https://feishu.cn/wiki/${nodeToken}`);
      recordTest('创建知识库节点权限 (wiki:wiki)', true);
      return nodeToken;
    } else {
      recordTest('创建知识库节点权限 (wiki:wiki)', false, new Error(`${nodeRes.code} - ${nodeRes.msg}`));
      return null;
    }
  } catch (error) {
    recordTest('创建知识库节点权限 (wiki:wiki)', false, error);
    return null;
  }
}

// 测试5: 验证知识库节点读取权限
async function test5_wikiNodeRead(client, spaces, nodeToken) {
  log.section('测试5：验证知识库节点读取权限 (wiki:wiki:readonly)');

  if (!spaces || spaces.length === 0) {
    log.info('跳过测试（无可用知识库）');
    return;
  }

  if (!nodeToken) {
    log.info('跳过测试（无可用节点Token）');
    return;
  }

  const spaceId = spaces[0].space_id;

  try {
    const res = await client.wiki.spaceNode.get({
      path: {
        space_id: spaceId,
        node_token: nodeToken
      }
    });

    if (res.code === 0) {
      log.info('知识库节点读取成功！');
      log.info(`  标题: ${res.data?.node?.title || '未知'}`);
      log.info(`  类型: ${res.data?.node?.obj_type || '未知'}`);
      recordTest('读取知识库节点权限 (wiki:wiki:readonly)', true);
    } else {
      recordTest('读取知识库节点权限 (wiki:wiki:readonly)', false, new Error(`${res.code} - ${res.msg}`));
    }
  } catch (error) {
    recordTest('读取知识库节点权限 (wiki:wiki:readonly)', false, error);
  }
}

// 测试6: 验证知识库节点列表读取权限
async function test6_wikiNodeList(client, spaces) {
  log.section('测试6：验证知识库节点列表读取权限 (wiki:wiki:readonly)');

  if (!spaces || spaces.length === 0) {
    log.info('跳过测试（无可用知识库）');
    return;
  }

  const spaceId = spaces[0].space_id;

  try {
    const res = await client.wiki.spaceNode.list({
      path: { space_id: spaceId },
      params: { page_size: 10 }
    });

    if (res.code === 0) {
      const count = res.data?.items?.length || 0;
      log.info(`成功获取节点列表！共 ${count} 个节点`);

      if (count > 0) {
        log.info('节点示例:');
        res.data.items.slice(0, 3).forEach((node, i) => {
          log.info(`  ${i + 1}. ${node.title || '未命名'}`);
        });
      }

      recordTest('读取知识库节点列表权限 (wiki:wiki:readonly)', true);
    } else {
      recordTest('读取知识库节点列表权限 (wiki:wiki:readonly)', false, new Error(`${res.code} - ${res.msg}`));
    }
  } catch (error) {
    recordTest('读取知识库节点列表权限 (wiki:wiki:readonly)', false, error);
  }
}

// 主测试流程
async function runTests() {
  log.section('飞书知识库权限TDD测试');

  const client = initClient();

  // 按顺序执行测试（有依赖关系）
  const documentId = await test1_documentCreate(client);
  await test2_documentRead(client, documentId);

  const spaces = await test3_wikiList(client);
  const nodeToken = await test4_wikiNodeCreate(client, spaces);
  await test5_wikiNodeRead(client, spaces, nodeToken);
  await test6_wikiNodeList(client, spaces);

  // 输出测试总结
  log.section('测试总结');
  log.info(`总测试数: ${testResults.total}`);
  log.info(`${colors.green}通过: ${testResults.passed}${colors.reset}`);
  log.info(`${colors.red}失败: ${testResults.failed}${colors.reset}`);

  if (testResults.failed === 0) {
    log.pass('所有测试通过！✨');
  } else {
    log.fail(`有 ${testResults.failed} 个测试失败`);
    console.log('\n' + colors.yellow + '⚠️  权限问题排查建议:' + colors.reset);
    console.log('1. 前往 https://open.feishu.cn/ 查看应用权限');
    console.log('2. 确认已申请以下权限:');
    console.log('   - wiki:wiki (创建/编辑知识库)');
    console.log('   - wiki:wiki:readonly (读取知识库)');
    console.log('   - docx:document (创建/编辑文档)');
    console.log('   - docx:document:readonly (读取文档)');
    console.log('3. 确认知识库管理员已将应用添加到知识库');
    console.log('4. 检查权限是否需要管理员审核通过\n');
  }

  // 返回测试结果（用于CI）
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  log.error('测试执行失败:');
  console.error(error);
  process.exit(1);
});
