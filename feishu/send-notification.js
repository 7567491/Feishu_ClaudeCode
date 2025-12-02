#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID;
const APP_SECRET = process.env.FeishuCC_App_Secret;
const RECEIVE_ID = process.env.FEISHU_NOTIFY_RECEIVE_ID || 'ou_c4d5cc3f310c7e7f96c994c9fd26c657';

async function sendNotification(message) {
  if (!APP_ID || !APP_SECRET) {
    console.log('⚠️  飞书凭证未配置，跳过通知');
    return;
  }

  try {
    const client = new lark.Client({
      appId: APP_ID,
      appSecret: APP_SECRET,
      domain: lark.Domain.Feishu
    });

    await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: RECEIVE_ID,
        content: JSON.stringify({ text: message }),
        msg_type: 'text'
      }
    });

    console.log('✅ 飞书通知已发送');
  } catch (error) {
    console.log('⚠️  飞书通知发送失败:', error.message);
  }
}

const message = process.argv[2] || '任务完成';
sendNotification(message);
