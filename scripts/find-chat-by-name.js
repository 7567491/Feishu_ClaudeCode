#!/usr/bin/env node
// 查找指定名称的群聊
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
    return result.tenant_access_token;
  }

  throw new Error(`获取 token 失败: ${result.msg}`);
}

async function getAllChats(token) {
  let allChats = [];
  let pageToken = '';

  do {
    const url = `https://open.feishu.cn/open-apis/im/v1/chats?page_size=100${pageToken ? '&page_token=' + pageToken : ''}`;
    const result = await httpsRequest(url, 'GET', {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    if (result.code === 0) {
      allChats = allChats.concat(result.data.items || []);
      pageToken = result.data.page_token || '';
      if (result.data.has_more) {
        console.log(`已获取 ${allChats.length} 个聊天，继续获取...`);
      }
    } else {
      throw new Error(`获取聊天列表失败: ${result.msg}`);
    }
  } while (pageToken);

  return allChats;
}

async function main() {
  try {
    const targetName = process.argv[2];
    if (!targetName) {
      console.log('用法: node find-chat-by-name.js <群聊名称>');
      console.log('示例: node find-chat-by-name.js "会飞的CC"');
      return;
    }

    console.log(`🔍 正在查找群聊: ${targetName}\n`);

    const token = await getTenantAccessToken();
    console.log('✅ Token 获取成功\n');

    console.log('📋 获取所有聊天列表...\n');
    const chats = await getAllChats(token);

    console.log(`总共找到 ${chats.length} 个聊天\n`);

    // 查找匹配的聊天
    const matches = chats.filter(chat =>
      chat.name && chat.name.includes(targetName)
    );

    if (matches.length === 0) {
      console.log(`❌ 未找到包含 "${targetName}" 的群聊\n`);
      console.log('所有群聊列表：');
      chats.forEach((chat, index) => {
        console.log(`${index + 1}. ${chat.name || '(无名称)'} - ${chat.chat_id} (${chat.chat_mode === 'p2p' ? '私聊' : '群聊'})`);
      });
      return;
    }

    console.log(`✅ 找到 ${matches.length} 个匹配的聊天:\n`);
    matches.forEach((chat, index) => {
      console.log(`${index + 1}. 名称: ${chat.name}`);
      console.log(`   Chat ID: ${chat.chat_id}`);
      console.log(`   类型: ${chat.chat_mode === 'p2p' ? '私聊' : '群聊'}`);
      console.log(`   描述: ${chat.description || '(无描述)'}`);
      console.log();
    });

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
  }
}

main();
