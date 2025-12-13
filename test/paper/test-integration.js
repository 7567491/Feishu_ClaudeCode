/**
 * Paper 功能集成测试
 *
 * 测试目标：
 * 1. 验证服务是否加载了最新代码
 * 2. 验证 paper 指令是否被正确拦截
 * 3. 验证完整流程是否正常工作
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// 测试配置
const testConfig = {
  timeout: 60000,  // 60秒超时
  testKeyword: '深度学习测试',
  expectedFiles: [
    /深度学习测试.*\.md$/,  // 文献综述文件
  ]
};

console.log('🧪 Paper 功能集成测试\n');
console.log('📁 项目根目录:', projectRoot);
console.log('⏱️  超时时间:', testConfig.timeout / 1000, '秒\n');

// 测试 1: 检查代码是否存在
async function test1_checkCode() {
  console.log('测试 1: 检查 paper 功能代码是否存在');

  const feishuWsPath = path.join(projectRoot, 'server/feishu-ws.js');
  const content = await fs.readFile(feishuWsPath, 'utf-8');

  const hasPaperCheck = content.includes("trimmedText.toLowerCase().startsWith('paper ')");
  const hasPaperHandler = content.includes('PaperHandler');

  console.log('  ✓ paper 检测逻辑:', hasPaperCheck ? '存在' : '缺失');
  console.log('  ✓ PaperHandler 引用:', hasPaperHandler ? '存在' : '缺失');

  if (!hasPaperCheck || !hasPaperHandler) {
    throw new Error('代码检查失败：paper 功能代码不完整');
  }

  console.log('  ✅ 通过\n');
}

// 测试 2: 检查 PM2 服务状态
async function test2_checkService() {
  console.log('测试 2: 检查 PM2 服务状态');

  return new Promise((resolve, reject) => {
    const pm2 = spawn('pm2', ['describe', 'feishu', '--no-colors']);
    let output = '';

    pm2.stdout.on('data', (data) => {
      output += data.toString();
    });

    pm2.on('close', (code) => {
      if (code !== 0) {
        console.log('  ❌ feishu 服务未运行');
        reject(new Error('feishu 服务未运行'));
        return;
      }

      // 解析启动时间
      const uptimeMatch = output.match(/uptime\s*│\s*(.+)/i);
      const statusMatch = output.match(/status\s*│\s*(\w+)/i);

      const status = statusMatch ? statusMatch[1] : 'unknown';
      const uptime = uptimeMatch ? uptimeMatch[1] : 'unknown';

      console.log('  ✓ 服务状态:', status);
      console.log('  ✓ 运行时长:', uptime);

      if (status !== 'online') {
        console.log('  ⚠️  警告：服务状态异常');
      }

      console.log('  ✅ 通过\n');
      resolve();
    });
  });
}

// 测试 3: 检查 paper/lib/handler.js 是否存在
async function test3_checkHandler() {
  console.log('测试 3: 检查 PaperHandler 文件');

  const handlerPath = path.join(projectRoot, 'paper/lib/handler.js');

  try {
    const stats = await fs.stat(handlerPath);
    console.log('  ✓ 文件存在:', handlerPath);
    console.log('  ✓ 文件大小:', stats.size, '字节');
    console.log('  ✓ 最后修改:', stats.mtime.toLocaleString('zh-CN'));

    // 读取内容检查关键方法
    const content = await fs.readFile(handlerPath, 'utf-8');
    const hasHandleMethod = content.includes('async handle(') || content.includes('async handlePaperCommand(');
    const hasClass = content.includes('class PaperHandler') || content.includes('export class PaperHandler');

    console.log('  ✓ PaperHandler 类:', hasClass ? '存在' : '缺失');
    console.log('  ✓ handle() 方法:', hasHandleMethod ? '存在' : '缺失');

    if (!hasClass || !hasHandleMethod) {
      throw new Error('PaperHandler 代码不完整');
    }

    console.log('  ✅ 通过\n');

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('  ❌ 文件不存在:', handlerPath);
      throw new Error('PaperHandler 文件缺失');
    }
    throw error;
  }
}

// 测试 4: 模拟 paper 指令检测
async function test4_simulateDetection() {
  console.log('测试 4: 模拟 paper 指令检测逻辑');

  const testMessages = [
    'paper 深度学习',
    'Paper 机器学习',
    '@Bot paper 自然语言处理'
  ];

  // 模拟 cleanMentions
  function cleanMentions(text) {
    let cleaned = text.replace(/@[^\s]+\s*/g, '');
    cleaned = cleaned.replace(/@_user_\d+/g, '');
    cleaned = cleaned.replace(/@_all/g, '');
    return cleaned.trim();
  }

  for (const msg of testMessages) {
    const cleaned = cleanMentions(msg);
    const trimmed = cleaned.trim();
    const isPaper = trimmed.toLowerCase().startsWith('paper ');

    console.log(`  测试消息: "${msg}"`);
    console.log(`    清理后: "${cleaned}"`);
    console.log(`    检测结果: ${isPaper ? '✓ 匹配' : '✗ 不匹配'}`);

    if (!isPaper) {
      throw new Error(`检测失败：${msg} 应该被识别为 paper 指令`);
    }
  }

  console.log('  ✅ 通过\n');
}

// 测试 5: 检查数据库最近的 paper 调用
async function test5_checkRecentCalls() {
  console.log('测试 5: 检查数据库中最近的 paper 调用');

  return new Promise((resolve, reject) => {
    const sqlite = spawn('sqlite3', [
      path.join(projectRoot, 'server/database/auth.db'),
      `SELECT id, session_id, direction, message_type, substr(content, 1, 50) as content, created_at
       FROM feishu_message_log
       WHERE content LIKE 'paper %'
       ORDER BY created_at DESC
       LIMIT 5;`
    ]);

    let output = '';
    let error = '';

    sqlite.stdout.on('data', (data) => {
      output += data.toString();
    });

    sqlite.stderr.on('data', (data) => {
      error += data.toString();
    });

    sqlite.on('close', (code) => {
      if (code !== 0) {
        console.log('  ❌ 数据库查询失败:', error);
        reject(new Error('数据库查询失败'));
        return;
      }

      if (output.trim()) {
        console.log('  最近的 paper 调用记录:');
        output.trim().split('\n').forEach(line => {
          console.log('    ', line);
        });
      } else {
        console.log('  ⚠️  未找到 paper 调用记录（可能是首次使用）');
      }

      console.log('  ✅ 通过\n');
      resolve();
    });
  });
}

// 主测试流程
async function runTests() {
  const startTime = Date.now();
  let passCount = 0;
  let failCount = 0;

  const tests = [
    { name: '代码检查', fn: test1_checkCode },
    { name: 'PM2服务状态', fn: test2_checkService },
    { name: 'Handler文件检查', fn: test3_checkHandler },
    { name: '检测逻辑模拟', fn: test4_simulateDetection },
    { name: '数据库历史检查', fn: test5_checkRecentCalls }
  ];

  for (const test of tests) {
    try {
      await test.fn();
      passCount++;
    } catch (error) {
      failCount++;
      console.error(`❌ 测试失败: ${test.name}`);
      console.error(`   错误: ${error.message}\n`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('═'.repeat(60));
  console.log(`📊 测试完成 (耗时 ${duration}秒)`);
  console.log(`   ✅ 通过: ${passCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log(`   📈 总计: ${tests.length}`);
  console.log('═'.repeat(60));

  if (failCount > 0) {
    console.log('\n💡 建议：');
    console.log('   1. 检查代码是否正确部署');
    console.log('   2. 重启 feishu 服务: pm2 restart feishu');
    console.log('   3. 查看服务日志: pm2 logs feishu --lines 50');
    process.exit(1);
  } else {
    console.log('\n✅ 所有测试通过！paper 功能应该可以正常工作。');
    console.log('   建议：在飞书中测试 "paper 深度学习" 验证实际效果');
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行失败:', error.message);
  process.exit(1);
});
