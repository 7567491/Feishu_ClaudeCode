#!/usr/bin/env node
/**
 * Bot2Bot HTTP API 测试
 * 测试通过 HTTP API 直接调用小六机器人
 */

import axios from 'axios';

// 小六机器人 API 配置
const XIAOLIU_API = {
  baseUrl: 'http://localhost:33300',  // 小六服务实际端口
  endpoint: '/api/feishu-proxy/query'  // 正确的 bot2bot API 端点
};

// 模拟 ultrathink 发送消息给小六
async function testBot2BotAPI() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🤖 Bot2Bot HTTP API 测试');
  console.log('═══════════════════════════════════════════════════════\n');

  // 使用正确的 API 请求格式
  const requestBody = {
    message: '来自 ultrathink 的测试消息：请帮我开发一个扫雷游戏',
    chatId: 'oc_15a90daa813d981076ffa50c0de0b5e4',  // AI初老师群组
    fromBot: 'ultrathink',
    apiKey: process.env.FEISHU_PROXY_API_KEY  // 如果设置了 API 密钥
  };

  try {
    console.log('📤 发送测试消息到小六 API...');
    console.log('   URL:', `${XIAOLIU_API.baseUrl}${XIAOLIU_API.endpoint}`);
    console.log('   消息内容:', requestBody.message);
    console.log('   目标群组:', requestBody.chatId);
    console.log('   发送者: ultrathink (机器人)\n');

    const response = await axios.post(
      `${XIAOLIU_API.baseUrl}${XIAOLIU_API.endpoint}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000  // 增加超时时间，因为小六需要处理任务
      }
    );

    console.log('✅ API 调用成功！');
    console.log('   状态码:', response.status);
    console.log('   响应:', response.data);

    return true;

  } catch (error) {
    console.error('❌ API 调用失败:');

    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   错误信息:', error.response.data);
    } else if (error.request) {
      console.error('   无法连接到小六服务');
      console.error('   请确保小六服务正在运行在', XIAOLIU_API.baseUrl);
    } else {
      console.error('   错误:', error.message);
    }

    return false;
  }
}

// 批量测试不同场景
async function runTests() {
  console.log('开始测试不同场景...\n');

  // 场景1: 群聊消息
  await testScenario('群聊消息', {
    chatId: 'oc_15a90daa813d981076ffa50c0de0b5e4',
    message: 'ultrathink 请求：帮我创建一个计算器应用'
  });

  // 场景2: 私聊消息（使用小六的 open_id）
  await testScenario('私聊消息', {
    chatId: 'ou_eb6ca12b119b7bbb4ffa73c12d225d98',
    message: 'ultrathink 私聊测试：生成一个贪吃蛇游戏'
  });
}

async function testScenario(name, options) {
  console.log(`\n📝 测试场景: ${name}`);
  console.log('─'.repeat(40));

  const requestBody = {
    message: options.message,
    chatId: options.chatId,
    fromBot: 'ultrathink',
    apiKey: process.env.FEISHU_PROXY_API_KEY
  };

  try {
    const response = await axios.post(
      `${XIAOLIU_API.baseUrl}${XIAOLIU_API.endpoint}`,
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );
    console.log(`✅ 成功 - 状态码: ${response.status}`);
    if (response.data) {
      console.log(`   响应:`, response.data);
    }
  } catch (error) {
    console.log(`❌ 失败 - ${error.message}`);
    if (error.response) {
      console.log(`   错误详情:`, error.response.data);
    }
  }
}

// 主函数
async function main() {
  // 首先测试基本连接
  const success = await testBot2BotAPI();

  if (success) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 测试结论');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('✅ HTTP API 方式可以实现 bot2bot 通信！');
    console.log('\n建议实施方案:');
    console.log('1. 为 ultrathink 配置小六的 API 端点');
    console.log('2. 在 ultrathink 中实现 HTTP 调用逻辑');
    console.log('3. 处理响应并继续对话流程');
  } else {
    console.log('\n⚠️ 测试失败，请检查:');
    console.log('1. 小六服务是否正在运行');
    console.log('2. 端口 57001 是否正确');
    console.log('3. 防火墙设置');
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
}

// 运行测试
main().catch(console.error);