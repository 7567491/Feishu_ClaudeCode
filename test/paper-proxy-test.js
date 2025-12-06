/**
 * Paper指令集成测试
 * 验证feishu-proxy.js是否正确处理paper指令
 */

import http from 'http';

const PORT = 33300;
const TEST_CHAT_ID = 'test-chat-paper-rca';
const API_PATH = '/api/feishu-proxy/query';

async function testPaperCommand() {
  console.log('🧪 开始测试 Paper 指令（通过 feishu-proxy）\n');

  const testData = JSON.stringify({
    chatId: TEST_CHAT_ID,
    message: 'paper 量子纠缠',
    fromBot: 'AI初老师-测试'
  });

  const options = {
    hostname: 'localhost',
    port: PORT,
    path: API_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(testData)
    }
  };

  return new Promise((resolve, reject) => {
    console.log(`📡 发送请求: POST http://localhost:${PORT}${API_PATH}`);
    console.log(`📨 消息内容: "paper 量子纠缠"\n`);

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`✅ 收到响应 (HTTP ${res.statusCode})`);
        console.log(`📄 响应内容:\n${data}\n`);

        try {
          const response = JSON.parse(data);

          // 验证响应格式
          if (response.success === true) {
            console.log('✅ 测试通过：API返回成功状态');

            if (response.message && response.message.includes('Paper command executed')) {
              console.log('✅ 测试通过：确认执行了Paper指令');
              console.log(`✅ 关键词: ${response.message.split(':')[1]?.trim()}`);
            } else {
              console.warn('⚠️  警告：响应消息格式异常');
            }

            if (response.sessionId) {
              console.log(`✅ Session ID: ${response.sessionId}`);
            }

            console.log('\n🎉 所有测试通过！');
            resolve(response);
          } else {
            console.error('❌ 测试失败：API返回失败状态');
            console.error('错误信息:', response.error || '未知错误');
            reject(new Error(response.error || 'API returned failure'));
          }

        } catch (error) {
          console.error('❌ 测试失败：无法解析响应JSON');
          console.error('原始响应:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ 请求失败:', error.message);
      reject(error);
    });

    req.write(testData);
    req.end();
  });
}

async function checkLogs() {
  console.log('\n📋 检查日志...\n');

  // 等待1秒让日志写入
  await new Promise(resolve => setTimeout(resolve, 1000));

  const { execSync } = await import('child_process');

  try {
    const logs = execSync('pm2 logs feishu --lines 50 --nostream 2>/dev/null | grep -i paper | tail -10', {
      encoding: 'utf-8'
    });

    if (logs.trim()) {
      console.log('🔍 Paper相关日志:');
      console.log(logs);
    } else {
      console.log('⚠️  未找到Paper相关日志');
    }
  } catch (error) {
    console.log('⚠️  无法读取日志（这是正常的，可能没有匹配项）');
  }
}

// 执行测试
(async () => {
  try {
    await testPaperCommand();
    await checkLogs();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 测试失败:', error.message);
    process.exit(1);
  }
})();
