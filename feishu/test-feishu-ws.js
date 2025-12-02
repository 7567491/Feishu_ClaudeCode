#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🚀 测试飞书 WebSocket 双向连接...\n');

// 创建 WebSocket 客户端
const wsClient = new lark.WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  loggerLevel: lark.LoggerLevel.debug
});

// 监听连接事件
wsClient.on('connect', () => {
  console.log('✅ WebSocket 连接已建立');
});

wsClient.on('disconnect', (reason) => {
  console.log('❌ WebSocket 断开连接:', reason);
});

wsClient.on('error', (error) => {
  console.log('❌ WebSocket 错误:', error.message);
});

// 监听消息事件
wsClient.on('im.message.receive_v1', async (data) => {
  console.log('\n📨 收到消息事件:');
  console.log('  消息ID:', data.message?.message_id);
  console.log('  对话ID:', data.message?.chat_id);
  console.log('  发送者:', data.sender?.sender_id?.open_id);
  console.log('  内容:', JSON.parse(data.message?.content || '{}'));

  // 这里可以回复消息
  console.log('  → 可以在这里调用 Claude 并回复');
});

// 监听所有事件（调试用）
wsClient.on('*', (eventType, data) => {
  console.log('\n📡 收到事件:', eventType);
  console.log('  数据:', JSON.stringify(data, null, 2).substring(0, 200));
});

// 启动 WebSocket 连接
console.log('🔌 正在连接飞书 WebSocket 服务器...');
wsClient.start().then(() => {
  console.log('🎉 WebSocket 客户端已启动');
  console.log('等待接收消息...\n');
}).catch((error) => {
  console.log('❌ 启动失败:', error.message);
  console.log('错误详情:', error);
});

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n👋 关闭连接...');
  wsClient.stop();
  process.exit(0);
});
