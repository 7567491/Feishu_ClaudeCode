/**
 * 将 Markdown 文件转换为飞书在线文档
 *
 * 用法: node server/convert-docs-to-feishu.js
 */

import fs from 'fs';
import path from 'path';
import { FeishuClient } from './lib/feishu-client.js';
import { credentialsDb, userDb, initializeDatabase } from './database/db.js';

async function convertMarkdownToFeishu(filePath, title, client) {
  try {
    console.log(`\n📄 正在处理: ${title}`);

    // 读取 Markdown 文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`   ✓ 文件读取成功，大小: ${(content.length / 1024).toFixed(2)} KB`);

    // 创建飞书文档
    const doc = await client.createDocumentFromMarkdown(title, content);
    console.log(`   ✓ 文档创建成功: ${doc.document_id}`);
    console.log(`   🔗 文档链接: ${doc.url}`);

    return {
      success: true,
      title,
      documentId: doc.document_id,
      url: doc.url
    };

  } catch (error) {
    console.error(`   ❌ 转换失败: ${error.message}`);
    return {
      success: false,
      title,
      error: error.message
    };
  }
}

async function main() {
  console.log('=' .repeat(60));
  console.log('📚 开始转换 Markdown 文档为飞书在线文档');
  console.log('=' .repeat(60));

  // 初始化数据库
  await initializeDatabase();
  console.log('\n✓ 数据库初始化成功');

  // 获取飞书凭证
  const user = userDb.getFirstUser();
  if (!user) {
    throw new Error('未找到用户');
  }

  let appId, appSecret;
  const credentialValue = credentialsDb.getActiveCredential(user.id, 'feishu');
  if (credentialValue) {
    const credentials = JSON.parse(credentialValue);
    appId = credentials.appId;
    appSecret = credentials.appSecret;
  } else {
    appId = process.env.FeishuCC_App_ID;
    appSecret = process.env.FeishuCC_App_Secret;
  }

  if (!appId || !appSecret) {
    throw new Error('未找到飞书凭证');
  }

  // 创建飞书客户端
  const client = new FeishuClient({ appId, appSecret });
  console.log('✓ 飞书客户端初始化成功\n');

  const documents = [
    { file: '/home/ccp/need.md', title: '文献综述系统 - 需求文档' },
    { file: '/home/ccp/design.md', title: '文献综述系统 - 详细设计文档' },
    { file: '/home/ccp/plan.md', title: '文献综述系统 - 开发计划' }
  ];

  const results = [];

  for (const doc of documents) {
    const result = await convertMarkdownToFeishu(doc.file, doc.title, client);
    results.push(result);
  }

  // 输出汇总
  console.log('\n' + '='.repeat(60));
  console.log('📊 转换汇总');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  console.log(`\n成功: ${successCount}/${results.length}\n`);

  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.title}`);
      console.log(`   ${result.url}\n`);
    } else {
      console.log(`❌ ${result.title}`);
      console.log(`   错误: ${result.error}\n`);
    }
  });

  console.log('='.repeat(60));
}

// 执行转换
main().catch(error => {
  console.error('程序执行失败:', error);
  process.exit(1);
});
