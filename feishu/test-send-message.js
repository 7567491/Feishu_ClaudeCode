#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';
import readline from 'readline';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🚀 飞书消息发送测试\n');

const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  domain: lark.Domain.Feishu
});

// 获取机器人信息
async function getBotInfo() {
  try {
    const tokenRes = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: APP_ID,
        app_secret: APP_SECRET
      }
    });

    console.log('✅ Token 获取成功');
    console.log('Token:', tokenRes.tenant_access_token.substring(0, 20) + '...\n');
    return tokenRes.tenant_access_token;
  } catch (error) {
    console.log('❌ 获取 token 失败:', error.message);
    return null;
  }
}

// 发送消息
async function sendMessage(receiveId, receiveIdType = 'open_id') {
  try {
    const res = await client.im.message.create({
      params: {
        receive_id_type: receiveIdType
      },
      data: {
        receive_id: receiveId,
        content: JSON.stringify({ text: '我是 CC' }),
        msg_type: 'text'
      }
    });

    if (res.code === 0) {
      console.log('✅ 消息发送成功！');
      console.log('消息 ID:', res.data.message_id);
      console.log('发送时间:', res.data.create_time);
      return true;
    } else {
      console.log('❌ 消息发送失败:');
      console.log('错误码:', res.code);
      console.log('错误信息:', res.msg);
      return false;
    }
  } catch (error) {
    console.log('❌ 发送失败:', error.message);
    if (error.response) {
      console.log('响应详情:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

// 获取用户输入
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// 主函数
async function main() {
  // 获取 token
  const token = await getBotInfo();
  if (!token) {
    console.log('\n⚠️  无法获取 token，请检查应用凭证');
    return;
  }

  console.log('💡 提示：需要接收方的 ID 才能发送消息');
  console.log('   - 私聊：需要用户的 open_id (如: ou_xxxxx)');
  console.log('   - 群聊：需要群组的 chat_id (如: oc_xxxxx)\n');
  console.log('📝 如何获取 ID：');
  console.log('   1. 在飞书中给机器人发送一条消息');
  console.log('   2. 后台日志会显示你的 open_id');
  console.log('   3. 或者在飞书开放平台查看测试用户信息\n');

  const receiveId = await askQuestion('请输入接收方 ID (open_id 或 chat_id): ');

  if (!receiveId || !receiveId.trim()) {
    console.log('❌ 未输入接收方 ID');
    return;
  }

  // 判断 ID 类型
  const receiveIdType = receiveId.startsWith('oc_') ? 'chat_id' : 'open_id';
  console.log(`\n📤 发送消息到 ${receiveIdType}: ${receiveId}`);
  console.log('消息内容: "我是 CC"\n');

  await sendMessage(receiveId.trim(), receiveIdType);
}

main().catch(console.error);
