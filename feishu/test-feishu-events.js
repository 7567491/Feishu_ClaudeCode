#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🔍 测试飞书双向通信机制...\n');
console.log('App ID:', APP_ID);
console.log('App Secret:', APP_SECRET.substring(0, 10) + '...\n');

// 创建客户端
const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu
});

console.log('📡 客户端创建成功');
console.log('可用方法:', Object.keys(client));
console.log('\n查看 client 结构:');
console.log(JSON.stringify(Object.keys(client), null, 2));

// 检查是否有事件监听相关的 API
if (client.on || client.addEventListener || client.ws || client.eventListener) {
  console.log('\n✅ 发现事件监听 API');
  console.log('事件监听方法:', {
    on: !!client.on,
    addEventListener: !!client.addEventListener,
    ws: !!client.ws,
    eventListener: !!client.eventListener
  });
}

// 检查 SDK 文档
console.log('\n📚 SDK 版本和功能检查...');
console.log('lark 对象键:', Object.keys(lark));
