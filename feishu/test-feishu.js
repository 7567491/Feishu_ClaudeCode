#!/usr/bin/env node
import fetch from 'node-fetch';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🔍 测试飞书应用凭证...\n');
console.log('App ID:', APP_ID);
console.log('App Secret:', APP_SECRET.substring(0, 10) + '...\n');

// 获取 tenant_access_token
async function getTenantAccessToken() {
  try {
    const response = await fetch('https://open.feishu.cn/open-api/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: APP_SECRET
      })
    });

    const text = await response.text();
    console.log('响应状态:', response.status);
    console.log('响应内容:', text.substring(0, 200));

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log('❌ JSON 解析失败:', e.message);
      return null;
    }

    if (data.code === 0) {
      console.log('✅ 成功获取 tenant_access_token');
      console.log('Token:', data.tenant_access_token.substring(0, 20) + '...');
      console.log('过期时间:', data.expire, '秒\n');
      return data.tenant_access_token;
    } else {
      console.log('❌ 获取 token 失败:');
      console.log('错误码:', data.code);
      console.log('错误信息:', data.msg);
      return null;
    }
  } catch (error) {
    console.log('❌ 网络请求失败:', error.message);
    return null;
  }
}

// 获取机器人信息
async function getBotInfo(token) {
  try {
    const response = await fetch('https://open.feishu.cn/open-api/bot/v3/info', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.code === 0) {
      console.log('✅ 机器人信息:');
      console.log('名称:', data.bot.app_name);
      console.log('Open ID:', data.bot.open_id);
      console.log('状态:', data.bot.activate_status === 1 ? '已启用' : '未启用');
      return data.bot;
    } else {
      console.log('❌ 获取机器人信息失败:', data.msg);
      return null;
    }
  } catch (error) {
    console.log('❌ 获取机器人信息失败:', error.message);
    return null;
  }
}

// 主函数
async function main() {
  const token = await getTenantAccessToken();

  if (token) {
    await getBotInfo(token);
    console.log('\n🎉 飞书 API 测试成功！可以开始集成。');
  } else {
    console.log('\n⚠️  请检查飞书应用凭证是否正确。');
  }
}

main().catch(console.error);
