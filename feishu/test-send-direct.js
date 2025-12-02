#!/usr/bin/env node
// 使用 HTTP API 直接发送测试消息
import https from 'https';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

function httpsRequest(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'parse_error', body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getTenantAccessToken() {
  const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
  const payload = JSON.stringify({
    app_id: APP_ID,
    app_secret: APP_SECRET
  });

  const result = await httpsRequest(url, 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }, payload);

  if (result.code === 0) {
    console.log('✅ Token 获取成功');
    return result.tenant_access_token;
  }

  throw new Error(`获取 token 失败: ${result.msg}`);
}

async function getChatList(token) {
  const url = 'https://open.feishu.cn/open-apis/im/v1/chats?page_size=20';
  const result = await httpsRequest(url, 'GET', {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  if (result.code === 0) {
    console.log('✅ 获取聊天列表成功\n');
    return result.data.items || [];
  }

  throw new Error(`获取聊天列表失败: ${result.msg}`);
}

async function sendMessage(token, chatId) {
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`;
  const payload = JSON.stringify({
    receive_id: chatId,
    msg_type: 'text',
    content: JSON.stringify({ text: '我是 CC' })
  });

  const result = await httpsRequest(url, 'POST', {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }, payload);

  if (result.code === 0) {
    console.log(`✅ 消息发送成功到聊天 ${chatId}`);
    console.log('   消息ID:', result.data.message_id);
    return true;
  } else {
    console.log(`❌ 消息发送失败: ${result.msg}`);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 测试 HTTP API 发送消息\n');

    const token = await getTenantAccessToken();

    console.log('\n📋 获取机器人的聊天列表...\n');
    const chats = await getChatList(token);

    if (chats.length === 0) {
      console.log('❌ 机器人没有参与任何聊天');
      console.log('   请先在飞书中给"小六"发送一条消息，或将机器人拉入群聊\n');
      return;
    }

    console.log(`找到 ${chats.length} 个聊天:\n`);
    chats.forEach((chat, index) => {
      console.log(`${index + 1}. ${chat.name || '(无名称)'}`);
      console.log(`   Chat ID: ${chat.chat_id}`);
      console.log(`   类型: ${chat.chat_mode === 'p2p' ? '私聊' : '群聊'}`);
      console.log();
    });

    // 发送到第一个聊天（很可能是最近的对话）
    console.log('📤 发送测试消息"我是 CC"到第一个聊天...\n');
    await sendMessage(token, chats[0].chat_id);

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
  }
}

main();
