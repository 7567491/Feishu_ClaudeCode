#!/usr/bin/env node
/**
 * TDD Test: Bot-to-Bot Message Event
 *
 * 目的：验证飞书是否推送机器人发送的消息事件
 *
 * 假设：
 * H1: 飞书平台不推送sender_type='app'的消息给WebSocket客户端
 * H2: 普通用户消息（sender_type='user'）可以正常触发事件
 * H3: 即使bot被@，bot发送的消息也不会触发im.message.receive_v1事件
 */

import lark from '@larksuiteoapi/node-sdk';
import { setTimeout } from 'timers/promises';

// 测试配置
const TEST_CONFIG = {
  appId: process.env.FeishuCC_App_ID || 'cli_a85b46e11ff6500d',
  appSecret: process.env.FeishuCC_App_Secret,
  testDuration: 30000, // 30秒监听时间
};

class BotMessageEventTester {
  constructor() {
    this.wsClient = null;
    this.receivedEvents = [];
    this.startTime = Date.now();
  }

  /**
   * 启动测试
   */
  async run() {
    console.log('\n════════════════════════════════════════════════════');
    console.log('🧪 Bot-to-Bot Message Event Test');
    console.log('════════════════════════════════════════════════════\n');

    console.log('测试配置：');
    console.log('  App ID:', TEST_CONFIG.appId);
    console.log('  测试时长:', TEST_CONFIG.testDuration / 1000, '秒');
    console.log('');

    await this.startWebSocket();
    await this.waitForMessages();
    await this.analyzeResults();
  }

  /**
   * 启动WebSocket连接
   */
  async startWebSocket() {
    console.log('📡 启动WebSocket连接...');

    this.wsClient = new lark.WSClient({
      appId: TEST_CONFIG.appId,
      appSecret: TEST_CONFIG.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    const eventDispatcher = new lark.EventDispatcher({
      loggerLevel: lark.LoggerLevel.info
    }).register({
      'im.message.receive_v1': (data) => {
        this.handleMessageEvent(data);
      }
    });

    await this.wsClient.start({ eventDispatcher });
    console.log('✅ WebSocket连接成功\n');
  }

  /**
   * 处理消息事件
   */
  handleMessageEvent(data) {
    const event = data.event || data;
    const timestamp = Date.now();
    const elapsed = ((timestamp - this.startTime) / 1000).toFixed(1);

    // 提取关键信息
    const eventInfo = {
      timestamp,
      elapsed: `${elapsed}s`,
      messageId: event.message?.message_id,
      chatType: event.message?.chat_type,
      senderType: event.sender?.sender_type,
      senderId: event.sender?.sender_id?.open_id,
      mentions: event.message?.mentions?.length || 0,
      content: this.extractContent(event.message?.content),
    };

    this.receivedEvents.push(eventInfo);

    // 实时输出
    console.log(`\n⚡ [${eventInfo.elapsed}] 收到消息事件:`);
    console.log(`   消息ID: ${eventInfo.messageId}`);
    console.log(`   会话类型: ${eventInfo.chatType}`);
    console.log(`   发送者类型: ${eventInfo.senderType} ${this.getSenderTypeIcon(eventInfo.senderType)}`);
    console.log(`   发送者ID: ${eventInfo.senderId}`);
    console.log(`   @提及数: ${eventInfo.mentions}`);
    console.log(`   内容预览: ${eventInfo.content.substring(0, 50)}...`);
  }

  /**
   * 提取消息内容
   */
  extractContent(contentJson) {
    if (!contentJson) return '';
    try {
      const parsed = JSON.parse(contentJson);
      return parsed.text || parsed.content || '';
    } catch {
      return contentJson.toString();
    }
  }

  /**
   * 获取发送者类型图标
   */
  getSenderTypeIcon(senderType) {
    const icons = {
      'user': '👤 (真实用户)',
      'app': '🤖 (机器人/应用)',
      'anonymous': '👻 (匿名)',
      'unknown': '❓ (未知)'
    };
    return icons[senderType] || icons.unknown;
  }

  /**
   * 等待消息
   */
  async waitForMessages() {
    console.log('⏳ 开始监听消息事件...');
    console.log('   请在飞书群聊中进行以下测试：');
    console.log('   1️⃣  真实用户@小六发送消息');
    console.log('   2️⃣  AI初老师机器人@小六发送消息');
    console.log('   3️⃣  观察哪些消息触发了事件\n');

    // 倒计时显示
    const totalSeconds = TEST_CONFIG.testDuration / 1000;
    for (let i = 0; i < totalSeconds; i += 5) {
      const remaining = totalSeconds - i;
      if (i > 0) {
        process.stdout.write(`\r⏱️  剩余时间: ${remaining}秒...`);
      }
      await setTimeout(5000);
    }

    console.log('\n\n⏹️  监听结束\n');
  }

  /**
   * 分析测试结果
   */
  async analyzeResults() {
    console.log('════════════════════════════════════════════════════');
    console.log('📊 测试结果分析');
    console.log('════════════════════════════════════════════════════\n');

    console.log(`总接收事件数: ${this.receivedEvents.length}\n`);

    if (this.receivedEvents.length === 0) {
      console.log('⚠️  未收到任何消息事件！');
      console.log('   可能原因：');
      console.log('   - 测试期间没有发送任何消息');
      console.log('   - WebSocket连接有问题');
      console.log('   - 应用权限配置不正确\n');
      return;
    }

    // 按发送者类型分组统计
    const byType = this.groupBySenderType();

    console.log('📈 按发送者类型统计：');
    Object.entries(byType).forEach(([type, events]) => {
      console.log(`   ${this.getSenderTypeIcon(type)}: ${events.length}条`);
    });
    console.log('');

    // 详细事件列表
    console.log('📋 详细事件列表：');
    this.receivedEvents.forEach((event, index) => {
      console.log(`   [${index + 1}] ${event.elapsed} - ${this.getSenderTypeIcon(event.senderType)}`);
      console.log(`       消息ID: ${event.messageId}`);
      console.log(`       内容: ${event.content.substring(0, 60)}...`);
    });
    console.log('');

    // 验证假设
    this.verifyHypotheses(byType);
  }

  /**
   * 按发送者类型分组
   */
  groupBySenderType() {
    return this.receivedEvents.reduce((acc, event) => {
      const type = event.senderType || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(event);
      return acc;
    }, {});
  }

  /**
   * 验证假设
   */
  verifyHypotheses(byType) {
    console.log('════════════════════════════════════════════════════');
    console.log('🔬 假设验证');
    console.log('════════════════════════════════════════════════════\n');

    const userCount = (byType.user || []).length;
    const appCount = (byType.app || []).length;

    // H1: 飞书不推送bot消息
    console.log('假设H1: 飞书平台不推送sender_type=\'app\'的消息');
    if (appCount === 0) {
      console.log('   ✅ 假设成立 - 未收到任何机器人消息事件');
      console.log('   结论: 飞书确实过滤了bot-to-bot消息');
    } else {
      console.log(`   ❌ 假设不成立 - 收到了${appCount}条机器人消息`);
      console.log('   结论: 飞书会推送机器人消息，问题在其他地方');
    }
    console.log('');

    // H2: 普通用户消息可以触发
    console.log('假设H2: 普通用户消息（sender_type=\'user\'）可以正常触发');
    if (userCount > 0) {
      console.log(`   ✅ 假设成立 - 收到了${userCount}条用户消息事件`);
      console.log('   结论: 用户消息处理正常');
    } else {
      console.log('   ⚠️  无法验证 - 测试期间没有用户发送消息');
      console.log('   建议: 重新测试时让真实用户@机器人发消息');
    }
    console.log('');

    // 总结
    console.log('════════════════════════════════════════════════════');
    console.log('📝 测试结论');
    console.log('════════════════════════════════════════════════════\n');

    if (appCount === 0 && userCount > 0) {
      console.log('✅ 结论确定: Bot-to-Bot消息不会触发im.message.receive_v1事件');
      console.log('');
      console.log('🎯 根本原因:');
      console.log('   飞书平台的安全策略过滤了机器人之间的消息事件，');
      console.log('   防止机器人之间无限循环对话。');
      console.log('');
      console.log('💡 解决方案:');
      console.log('   1. API调用方式: AI初老师通过HTTP API直接调用小六服务');
      console.log('   2. Webhook转发: 使用中间服务转发消息');
      console.log('   3. 修改交互方式: 用户手动转发AI初老师的输出给小六');
      console.log('');
    } else if (appCount > 0) {
      console.log('⚠️  意外发现: 飞书确实推送了机器人消息！');
      console.log('');
      console.log('🔍 需要进一步调查:');
      console.log('   既然收到了机器人消息事件，为什么小六没有响应？');
      console.log('   可能的原因:');
      console.log('   - isMessageForBot() 逻辑问题');
      console.log('   - 消息内容解析问题');
      console.log('   - 异常处理捕获了错误但没有日志');
      console.log('');
    } else {
      console.log('⚠️  测试不充分: 需要更多数据');
      console.log('');
      console.log('建议:');
      console.log('   - 让真实用户在群里@小六发消息');
      console.log('   - 让AI初老师机器人在群里@小六发消息');
      console.log('   - 重新运行测试');
      console.log('');
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    console.log('🧹 清理资源...');
    // SDK会自动处理连接关闭
    console.log('✅ 测试完成\n');
  }
}

// 运行测试
async function main() {
  const tester = new BotMessageEventTester();

  try {
    await tester.run();
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await tester.cleanup();
    process.exit(0);
  }
}

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n\n⚠️  测试被中断');
  process.exit(0);
});

main();
