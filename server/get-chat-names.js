import lark from '@larksuiteoapi/node-sdk';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const client = new lark.Client({
  appId: process.env.FeishuCC_App_ID,
  appSecret: process.env.FeishuCC_App_Secret,
  domain: lark.Domain.Feishu
});

const db = new Database(path.join(__dirname, 'database', 'auth.db'));

const sessions = db.prepare(`
  SELECT id, conversation_id, project_path
  FROM feishu_sessions
  WHERE session_type='group'
  ORDER BY last_activity DESC
  LIMIT 30
`).all();

console.log('群聊名称\tchat_id\t工作目录');
console.log('---');

for (const session of sessions) {
  const chatId = session.conversation_id.replace('group-', '');
  try {
    const res = await client.im.chat.get({ chat_id: chatId });
    console.log(`${res.data.name || '未命名'}\t${chatId}\t${session.project_path}`);
  } catch (err) {
    console.log(`获取失败\t${chatId}\t${session.project_path}`);
  }
}

db.close();
