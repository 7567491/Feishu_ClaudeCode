#!/usr/bin/env node
/**
 * Send - 统一文件发送工具
 *
 * 用法：
 *   send <pattern> [chat_id]
 *
 * 示例：
 *   send file.pdf                    # 发送单个文件到当前对话
 *   send *.pdf oc_xxx                # 发送所有 PDF 到指定群聊
 *   send ./docs/ ou_xxx              # 发送目录下所有文件到私聊
 *   send "papers/*.{pdf,md}"         # 发送匹配模式的文件
 *
 * 支持格式：
 *   文档: .pdf, .md, .doc, .docx, .txt
 *   表格: .xls, .xlsx, .csv
 *   演示: .ppt, .pptx
 *   图片: .jpg, .png, .gif, .svg, .webp
 *   音频: .mp3, .wav, .m4a, .aac
 *   视频: .mp4, .avi, .mov, .mkv
 *   压缩: .zip, .rar, .7z, .tar, .gz
 */

import { FileSender } from './lib/file-sender.js';
import { FeishuClient } from './lib/feishu-client.js';
import { credentialsDb, userDb, initializeDatabase } from './database/db.js';
import path from 'path';
import fs from 'fs';

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function printUsage() {
  console.log(`
${colors.bright}Send - 统一文件发送工具${colors.reset}

${colors.cyan}用法：${colors.reset}
  send <pattern> [chat_id]

${colors.cyan}示例：${colors.reset}
  send file.pdf                    # 发送单个文件
  send *.pdf oc_xxx                # 发送所有 PDF 到指定群聊
  send ./docs/ ou_xxx              # 发送目录下所有文件
  send "papers/*.{pdf,md}"         # 发送匹配模式的文件

${colors.cyan}支持格式：${colors.reset}
  ${colors.dim}文档:${colors.reset} .pdf, .md, .doc, .docx, .txt
  ${colors.dim}表格:${colors.reset} .xls, .xlsx, .csv
  ${colors.dim}演示:${colors.reset} .ppt, .pptx
  ${colors.dim}图片:${colors.reset} .jpg, .png, .gif, .svg, .webp
  ${colors.dim}音频:${colors.reset} .mp3, .wav, .m4a, .aac
  ${colors.dim}视频:${colors.reset} .mp4, .avi, .mov, .mkv
  ${colors.dim}压缩:${colors.reset} .zip, .rar, .7z, .tar, .gz
`);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function main() {
  try {
    console.log(`${colors.bright}📤 文件发送工具${colors.reset}\n`);

    // 解析参数
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
      printUsage();
      process.exit(0);
    }

    const pattern = args[0];
    const chatId = args[1];

    // 初始化数据库
    await initializeDatabase();

    // 获取凭证
    const user = userDb.getFirstUser();
    if (!user) {
      throw new Error('未找到用户，请先配置认证信息');
    }

    let appId, appSecret;
    const credentialValue = credentialsDb.getActiveCredential(user.id, 'feishu');
    if (credentialValue) {
      const credentials = JSON.parse(credentialValue);
      appId = credentials.appId;
      appSecret = credentials.appSecret;
    } else {
      appId = process.env.FeishuCC_App_ID;
      appSecret = process.env.FeishuCC_App_Secret;
    }

    if (!appId || !appSecret) {
      throw new Error('未找到飞书凭证，请配置 FeishuCC_App_ID 和 FeishuCC_App_Secret');
    }

    // 创建飞书客户端
    const client = new FeishuClient({ appId, appSecret });

    // 创建文件发送器
    const sender = new FileSender(client);

    // 解析文件列表（预览）
    console.log(`${colors.blue}📁 扫描文件...${colors.reset}`);
    const files = await sender._resolveFiles(pattern);

    if (files.length === 0) {
      console.log(`${colors.yellow}⚠️  未找到匹配的文件${colors.reset}\n`);
      process.exit(0);
    }

    // 显示文件列表
    console.log(`\n${colors.green}找到 ${files.length} 个文件：${colors.reset}\n`);
    files.forEach((file, i) => {
      const stats = fs.statSync(file);
      const size = formatSize(stats.size);
      const fileName = path.basename(file);
      console.log(`  ${colors.dim}${i + 1}.${colors.reset} ${fileName} ${colors.dim}(${size})${colors.reset}`);
    });

    // 确认发送
    if (!chatId) {
      console.log(`\n${colors.yellow}⚠️  未指定 chat_id，请提供目标聊天 ID${colors.reset}`);
      console.log(`${colors.dim}用法: send <pattern> <chat_id>${colors.reset}\n`);
      process.exit(1);
    }

    console.log(`\n${colors.cyan}💬 目标:${colors.reset} ${chatId}`);
    console.log(`${colors.blue}⏳ 开始发送...${colors.reset}\n`);

    // 发送文件
    let current = 0;
    const startTime = Date.now();

    const result = await sender.send(pattern, chatId, {
      delay: 1500, // 1.5 秒间隔
      onProgress: (curr, total, file) => {
        current = curr;
        const fileName = path.basename(file);
        const progress = `[${curr}/${total}]`;
        console.log(`  ${colors.green}✓${colors.reset} ${progress} ${fileName}`);
      }
    });

    // 显示结果
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${colors.bright}📊 发送完成${colors.reset}`);
    console.log(`  ${colors.green}✓ 成功:${colors.reset} ${result.success}`);
    if (result.failed > 0) {
      console.log(`  ${colors.red}✗ 失败:${colors.reset} ${result.failed}`);
    }
    console.log(`  ${colors.dim}⏱ 耗时:${colors.reset} ${elapsed}s\n`);

    // 显示失败详情
    if (result.failed > 0) {
      console.log(`${colors.red}失败文件：${colors.reset}`);
      result.files
        .filter(f => !f.success)
        .forEach(f => {
          console.log(`  ${colors.red}✗${colors.reset} ${path.basename(f.file)}: ${f.error}`);
        });
      console.log('');
    }

  } catch (error) {
    console.error(`\n${colors.red}❌ 错误:${colors.reset} ${error.message}\n`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
