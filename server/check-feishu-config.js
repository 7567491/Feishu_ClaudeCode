#!/usr/bin/env node
/**
 * 飞书配置检查工具
 *
 * 检查飞书应用的配置状态，帮助诊断文件接收问题
 */

import lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';

dotenv.config();

const appId = process.env.FeishuCC_App_ID;
const appSecret = process.env.FeishuCC_App_Secret;

console.log('🔍 飞书应用配置检查工具');
console.log('='.repeat(60));

// 检查环境变量
console.log('\n1️⃣  环境变量检查:');
if (!appId || !appSecret) {
  console.log('   ❌ 缺少飞书应用凭证');
  console.log('   请设置环境变量：FeishuCC_App_ID 和 FeishuCC_App_Secret');
  process.exit(1);
}
console.log('   ✅ App ID:', appId);
console.log('   ✅ App Secret:', appSecret.substring(0, 10) + '...');

// 创建客户端
const client = new lark.Client({
  appId,
  appSecret,
  domain: lark.Domain.Feishu
});

console.log('\n2️⃣  SDK 版本:');
console.log('   ℹ️  @larksuiteoapi/node-sdk:', '已安装');

console.log('\n3️⃣  必需权限清单:');
const requiredPermissions = [
  { name: 'im:message', desc: '获取与发送单聊、群组消息' },
  { name: 'im:resource', desc: '读取用户发送的资源文件' },
  { name: 'im:message.group_msg', desc: '获取群组消息（可选）' },
  { name: 'im:message.p2p_msg', desc: '获取私聊消息（可选）' }
];

console.log('   请在飞书开放平台检查以下权限是否已启用:');
requiredPermissions.forEach((perm, index) => {
  console.log(`   ${index + 1}. ${perm.name.padEnd(25)} - ${perm.desc}`);
});

console.log('\n4️⃣  事件订阅检查:');
console.log('   请在飞书开放平台检查以下事件是否已订阅:');
console.log('   1. im.message.receive_v1     - 接收消息 v2.0');

console.log('\n5️⃣  测试API连接:');
try {
  // 尝试获取 tenant access token 来验证凭证
  const tokenRes = await client.auth.tenantAccessToken.internal({
    data: {
      app_id: appId,
      app_secret: appSecret
    }
  });

  if (tokenRes.code === 0) {
    console.log('   ✅ API 连接成功');
    console.log('   ✅ 凭证有效');
  } else {
    console.log('   ❌ API 调用失败:', tokenRes.msg);
  }
} catch (error) {
  console.log('   ❌ API 连接失败:', error.message);
}

console.log('\n' + '='.repeat(60));
console.log('📋 配置检查完成\n');

console.log('下一步操作:');
console.log('1. 登录飞书开放平台: https://open.feishu.cn/app');
console.log(`2. 找到应用 (App ID: ${appId})`);
console.log('3. 检查"权限管理" - 确保上述权限已启用');
console.log('4. 检查"事件订阅" - 确保 im.message.receive_v1 已订阅');
console.log('5. 运行测试: node server/test-feishu-file-receive.js\n');
