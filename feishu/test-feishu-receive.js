#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🚀 启动飞书消息监听器...\n');
console.log('请在飞书中给机器人发送一条消息（任意内容）\n');

const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  domain: lark.Domain.Feishu
});

// 发送回复消息
async function sendReply(chatId, openId) {
  try {
    const res = await client.im.message.create({
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: chatId,
        content: JSON.stringify({ text: '我是 CC' }),
        msg_type: 'text'
      }
    });

    if (res.code === 0) {
      console.log('✅ 回复消息 "我是 CC" 已发送！');
      return true;
    } else {
      console.log('❌ 回复失败:', res.msg);
      return false;
    }
  } catch (error) {
    console.log('❌ 回复失败:', error.message);
    return false;
  }
}

// 创建 WebSocket 客户端
const wsClient = new lark.WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  loggerLevel: lark.LoggerLevel.info
});

console.log('🔌 正在建立 WebSocket 连接...\n');

// 启动监听
wsClient.start({
  eventDispatcher: new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      console.log('\n📨 收到消息！');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const { message, sender } = data;
      const content = JSON.parse(message.content);

      console.log('消息 ID:', message.message_id);
      console.log('对话 ID:', message.chat_id);
      console.log('发送者 open_id:', sender.sender_id.open_id);
      console.log('对话类型:', message.chat_type === 'p2p' ? '私聊' : '群聊');
      console.log('消息内容:', content.text);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // 发送回复
      console.log('📤 发送回复消息...');
      await sendReply(message.chat_id, sender.sender_id.open_id);

      console.log('\n✅ 测试完成！');
      console.log('💡 你的 open_id 是:', sender.sender_id.open_id);
      console.log('   可以用这个 ID 在其他脚本中测试发送消息\n');
    }
  })
});

// 处理连接事件
console.log('⏳ 等待连接建立...');
console.log('提示：连接成功后，请在飞书中给机器人发送消息\n');

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n\n👋 关闭连接...');
  wsClient.stop();
  process.exit(0);
});
