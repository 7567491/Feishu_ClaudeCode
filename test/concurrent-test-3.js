/**
 * 并发测试 #3 - 测试服务器并发处理能力
 */

import http from 'http';
import { performance } from 'perf_hooks';

// 配置参数
const SERVER_URL = 'http://localhost:33300';
const SERVER_PORT = 33300;
const CONCURRENT_REQUESTS = 10;  // 并发请求数
const TEST_ENDPOINT = '/health';  // 测试端点

/**
 * 发送单个请求
 */
async function sendRequest(id) {
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      id: id,
      message: `Test request ${id}`,
      timestamp: new Date().toISOString()
    });

    const options = {
      hostname: 'localhost',
      port: SERVER_PORT,
      path: TEST_ENDPOINT,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        resolve({
          id,
          status: res.statusCode,
          duration: duration.toFixed(2),
          response: responseData,
          success: res.statusCode === 200
        });
      });
    });

    req.on('error', (error) => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      resolve({
        id,
        status: 'error',
        duration: duration.toFixed(2),
        error: error.message,
        success: false
      });
    });

    req.end();
  });
}

/**
 * 运行并发测试
 */
async function runConcurrentTest() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║          并发测试 #3 - 服务器并发处理能力测试           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`📊 测试参数:`);
  console.log(`   - 服务器地址: ${SERVER_URL}`);
  console.log(`   - 并发请求数: ${CONCURRENT_REQUESTS}`);
  console.log(`   - 测试端点: ${TEST_ENDPOINT}\n`);

  console.log('🚀 开始发送并发请求...\n');

  const startTime = performance.now();

  // 创建并发请求
  const promises = [];
  for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
    promises.push(sendRequest(i));
  }

  // 等待所有请求完成
  const results = await Promise.all(promises);

  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  // 统计结果
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const avgDuration = results.reduce((sum, r) => sum + parseFloat(r.duration), 0) / results.length;
  const maxDuration = Math.max(...results.map(r => parseFloat(r.duration)));
  const minDuration = Math.min(...results.map(r => parseFloat(r.duration)));

  console.log('📈 测试结果:\n');
  console.log('┌─────────┬──────────┬─────────────┬────────────────────────┐');
  console.log('│ 请求ID  │  状态码  │  耗时(ms)   │         结果           │');
  console.log('├─────────┼──────────┼─────────────┼────────────────────────┤');

  results.forEach(result => {
    const status = result.status === 'error' ? 'ERROR' : result.status;
    const outcome = result.success ? '✅ 成功' : '❌ 失败';
    console.log(`│   ${result.id.toString().padEnd(5)} │   ${status.toString().padEnd(6)} │  ${result.duration.padStart(10)} │  ${outcome.padEnd(20)} │`);
  });

  console.log('└─────────┴──────────┴─────────────┴────────────────────────┘\n');

  console.log('📊 统计汇总:');
  console.log(`   ✅ 成功请求: ${successCount}/${CONCURRENT_REQUESTS}`);
  console.log(`   ❌ 失败请求: ${failureCount}/${CONCURRENT_REQUESTS}`);
  console.log(`   ⏱️  总耗时: ${totalDuration.toFixed(2)} ms`);
  console.log(`   📈 平均耗时: ${avgDuration.toFixed(2)} ms`);
  console.log(`   📊 最长耗时: ${maxDuration.toFixed(2)} ms`);
  console.log(`   📊 最短耗时: ${minDuration.toFixed(2)} ms`);
  console.log(`   🎯 成功率: ${((successCount / CONCURRENT_REQUESTS) * 100).toFixed(1)}%\n`);

  // 分析结果
  console.log('🔍 分析:');
  if (successCount === CONCURRENT_REQUESTS) {
    console.log('   ✅ 所有并发请求都成功处理');
    console.log('   ✅ 服务器能够处理当前并发量');
  } else if (successCount > 0) {
    console.log('   ⚠️  部分请求失败');
    console.log('   ⚠️  服务器可能存在并发处理问题');
  } else {
    console.log('   ❌ 所有请求都失败');
    console.log('   ❌ 服务器可能未启动或端点不存在');
  }

  if (maxDuration - minDuration > 1000) {
    console.log('   ⚠️  请求处理时间差异较大，可能存在性能瓶颈');
  }

  // 检查是否有错误
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.log('\n❌ 错误详情:');
    errors.forEach(err => {
      console.log(`   请求 ${err.id}: ${err.error}`);
    });
  }

  return {
    totalRequests: CONCURRENT_REQUESTS,
    successCount,
    failureCount,
    avgDuration,
    totalDuration,
    successRate: (successCount / CONCURRENT_REQUESTS) * 100
  };
}

/**
 * 高级并发测试 - 逐步增加并发量
 */
async function runProgressiveConcurrentTest() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║        高级并发测试 - 逐步增加并发量                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const concurrentLevels = [1, 5, 10, 20, 50];
  const results = [];

  for (const level of concurrentLevels) {
    console.log(`\n🔄 测试并发量: ${level}`);
    console.log('─'.repeat(60));

    const startTime = performance.now();
    const promises = [];

    for (let i = 1; i <= level; i++) {
      promises.push(sendRequest(i));
    }

    const levelResults = await Promise.all(promises);
    const endTime = performance.now();

    const successCount = levelResults.filter(r => r.success).length;
    const avgDuration = levelResults.reduce((sum, r) => sum + parseFloat(r.duration), 0) / levelResults.length;

    results.push({
      level,
      successCount,
      failureCount: level - successCount,
      avgDuration,
      totalDuration: endTime - startTime,
      successRate: (successCount / level) * 100
    });

    console.log(`   ✅ 成功: ${successCount}/${level}`);
    console.log(`   ⏱️  平均耗时: ${avgDuration.toFixed(2)} ms`);
    console.log(`   🎯 成功率: ${((successCount / level) * 100).toFixed(1)}%`);

    // 等待一下再进行下一轮测试
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 显示趋势分析
  console.log('\n📊 并发性能趋势:');
  console.log('┌──────────┬──────────┬──────────┬──────────────┬──────────┐');
  console.log('│ 并发量   │ 成功数   │ 失败数   │ 平均耗时(ms) │ 成功率   │');
  console.log('├──────────┼──────────┼──────────┼──────────────┼──────────┤');

  results.forEach(r => {
    console.log(`│    ${r.level.toString().padEnd(5)} │   ${r.successCount.toString().padEnd(6)} │   ${r.failureCount.toString().padEnd(6)} │  ${r.avgDuration.toFixed(2).padStart(11)} │ ${r.successRate.toFixed(1).padStart(7)}% │`);
  });

  console.log('└──────────┴──────────┴──────────┴──────────────┴──────────┘');

  // 性能分析
  console.log('\n🔍 性能分析:');
  const perfDropIndex = results.findIndex(r => r.successRate < 90);
  if (perfDropIndex > -1) {
    console.log(`   ⚠️  在并发量 ${results[perfDropIndex].level} 时，成功率降至 ${results[perfDropIndex].successRate.toFixed(1)}%`);
    console.log(`   💡 建议: 最佳并发量约为 ${perfDropIndex > 0 ? results[perfDropIndex - 1].level : 1}`);
  } else {
    console.log('   ✅ 服务器在所有测试并发量下表现良好');
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'basic';

  try {
    if (testType === 'progressive') {
      await runProgressiveConcurrentTest();
    } else {
      await runConcurrentTest();
    }
  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runConcurrentTest, runProgressiveConcurrentTest };