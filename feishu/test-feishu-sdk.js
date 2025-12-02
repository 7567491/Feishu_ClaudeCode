#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🔍 使用官方 SDK 测试飞书应用凭证...\n');
console.log('App ID:', APP_ID);
console.log('App Secret:', APP_SECRET.substring(0, 10) + '...\n');

// 创建客户端
const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu
});

async function test() {
  try {
    // 测试获取 tenant access token
    console.log('📡 正在获取 tenant_access_token...');
    const tokenRes = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: APP_ID,
        app_secret: APP_SECRET
      }
    });

    console.log('Token 响应:', tokenRes);

    if (tokenRes.code === 0) {
      console.log('✅ 成功获取 token!');
      console.log('Token:', tokenRes.tenant_access_token?.substring(0, 20) + '...\n');

      // 使用 token 获取机器人信息
      console.log('📡 正在获取机器人信息...');
      const botRes = await client.request({
        method: 'GET',
        url: '/open-api/bot/v3/info',
        headers: {
          'Authorization': `Bearer ${tokenRes.tenant_access_token}`
        }
      });

      console.log('机器人响应:', botRes);

      if (botRes.code === 0) {
        console.log('✅ 成功获取机器人信息!\n');
        console.log('机器人信息:');
        console.log('  名称:', botRes.data?.bot?.app_name);
        console.log('  Open ID:', botRes.data?.bot?.open_id);
        console.log('\n🎉 飞书 API 测试成功！');
        return botRes.data?.bot;
      }
    } else {
      console.log('❌ 获取 token 失败:');
      console.log('错误码:', tokenRes.code);
      console.log('错误信息:', tokenRes.msg);
      return null;
    }
  } catch (error) {
    console.log('❌ 测试失败:', error.message);
    console.log('错误详情:', error);
    return null;
  }
}

test().catch(console.error);
