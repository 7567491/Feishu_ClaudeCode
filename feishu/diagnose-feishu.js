#!/usr/bin/env node
import lark from '@larksuiteoapi/node-sdk';

const APP_ID = process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d';
const APP_SECRET = process.env.FeishuCC_App_Secret || 'GwzMoZf6RMMtJFxBASHYBRbJcwVrCEgN';

console.log('🔍 飞书应用配置诊断\n');
console.log('═══════════════════════════════════════════════════\n');

const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  domain: lark.Domain.Feishu
});

async function diagnose() {
  try {
    // 1. 获取 token
    console.log('1️⃣ 测试 Token 获取...');
    const tokenRes = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: APP_ID,
        app_secret: APP_SECRET
      }
    });

    if (tokenRes.code === 0) {
      console.log('   ✅ Token 获取成功\n');
    } else {
      console.log('   ❌ Token 获取失败:', tokenRes.msg, '\n');
      return;
    }

    // 2. 获取机器人信息
    console.log('2️⃣ 获取机器人信息...');
    const botRes = await client.request({
      method: 'GET',
      url: '/open-api/bot/v3/info',
      headers: {
        'Authorization': `Bearer ${tokenRes.tenant_access_token}`
      }
    });

    console.log('   响应状态:', botRes.status);
    console.log('   响应数据:', JSON.stringify(botRes.data, null, 2));

    if (botRes.data && botRes.data.code === 0) {
      console.log('   ✅ 机器人名称:', botRes.data.bot?.app_name || '未知');
      console.log('   ✅ 机器人 Open ID:', botRes.data.bot?.open_id);
      console.log('   ✅ 激活状态:', botRes.data.bot?.activate_status === 1 ? '已启用' : '未启用');
      console.log();
    } else {
      console.log('   ⚠️  无法获取机器人信息\n');
    }

    // 3. 检查权限
    console.log('3️⃣ 检查应用权限...');
    console.log('   请手动确认飞书开放平台配置：\n');
    console.log('   📋 必需权限：');
    console.log('      - im:message (发送和接收消息)');
    console.log('      - im:message.group_at_msg (接收群聊@消息)');
    console.log();

    // 4. 检查事件订阅配置
    console.log('4️⃣ 长连接配置检查清单：\n');
    console.log('   请访问: https://open.feishu.cn/app');
    console.log('   选择应用: 小六');
    console.log();
    console.log('   ✓ 步骤 1: 【事件与回调】→【订阅方式】');
    console.log('            确认已选择: "使用长连接接收事件/回调"');
    console.log();
    console.log('   ✓ 步骤 2: 【添加事件】');
    console.log('            搜索并添加: "im.message.receive_v1"');
    console.log('            (接收消息v2.0)');
    console.log();
    console.log('   ✓ 步骤 3: 【权限管理】');
    console.log('            确认已开通以下权限:');
    console.log('            - 获取与发送单聊、群组消息');
    console.log('            - 接收群聊中@机器人消息事件');
    console.log();
    console.log('   ✓ 步骤 4: 【版本管理与发布】');
    console.log('            申请发布应用（如果是企业版）');
    console.log('            或确保应用已在当前企业可用');
    console.log();

    // 5. 测试直接发送消息
    console.log('5️⃣ 如果你有自己的 open_id，我可以测试发送消息');
    console.log('   请在飞书中给机器人发送消息后，查看日志获取 open_id\n');

    console.log('═══════════════════════════════════════════════════');
    console.log('📝 诊断完成！\n');

  } catch (error) {
    console.log('\n❌ 诊断过程出错:', error.message);
    if (error.response) {
      console.log('错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

diagnose();
