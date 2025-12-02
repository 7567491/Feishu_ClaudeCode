#!/usr/bin/env node
// 测试群聊路径匹配逻辑
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';
const CHAT_ID = 'oc_81f7baa8cbe331e80aa85e1d4e9ced10';

async function testChatPath() {
  try {
    console.log('🧪 测试群聊路径匹配逻辑\n');

    // 创建 Lark Client
    const client = new lark.Client({
      appId: APP_ID,
      appSecret: APP_SECRET,
      domain: lark.Domain.Feishu
    });

    console.log(`1. 获取群聊信息 (chat_id: ${CHAT_ID})\n`);

    const res = await client.im.chat.get({
      path: {
        chat_id: CHAT_ID
      }
    });

    if (res.code === 0) {
      const chat = res.data;
      console.log('✅ 成功获取群聊信息:');
      console.log('   群名:', chat?.name);
      console.log('   描述:', chat?.description || '(无)');
      console.log('   类型:', chat?.chat_mode);
      console.log();

      // 测试路径匹配逻辑
      const chatName = chat?.name;
      console.log('2. 测试路径匹配规则\n');

      // 模拟 getCustomProjectPath 逻辑
      const pathRules = [
        {
          namePrefix: '会飞的CC',
          path: '/home/ccp'
        }
      ];

      console.log('   规则配置:', JSON.stringify(pathRules, null, 2));
      console.log();

      let matched = false;
      for (const rule of pathRules) {
        console.log(`   检查: "${chatName}" 是否以 "${rule.namePrefix}" 开头?`);
        if (chatName && chatName.startsWith(rule.namePrefix)) {
          console.log(`   ✅ 匹配成功! 路径: ${rule.path}`);
          matched = true;
          break;
        } else {
          console.log(`   ❌ 不匹配`);
        }
      }

      if (!matched) {
        console.log('\n   ⚠️  未匹配任何规则，将使用默认路径');
      }

    } else {
      console.error('❌ 获取群聊信息失败:', res.code, res.msg);
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
  }
}

testChatPath();
