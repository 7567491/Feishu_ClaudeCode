/**
 * Codex CLI Wrapper
 * 基于 gaccode 改造的 Codex CLI,复用 gaccode token
 * 提供对 Codex CLI 的封装,支持非交互模式代码生成
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let activeCodexProcesses = new Map();

/**
 * 加载 gaccode Token
 * @returns {Promise<string|null>}
 */
async function loadGaccodeToken() {
  try {
    const configPath = path.join(os.homedir(), '.claudecode', 'config');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);

    if (!config.token) {
      console.error('[Codex] Token not found in config');
      return null;
    }

    console.log('[Codex] Token loaded:', config.token.substring(0, 20) + '...');
    return config.token;
  } catch (error) {
    console.error('[Codex] Failed to load gaccode token:', error.message);
    return null;
  }
}

/**
 * 调用 Codex CLI 生成代码
 * @param {string} prompt - 用户提示词
 * @param {Object} options - 配置选项
 * @param {Object} writer - 消息写入器(飞书)
 * @returns {Promise<string>} - Codex 输出
 */
export async function queryCodex(prompt, options = {}, writer) {
  return new Promise(async (resolve, reject) => {
    const { projectPath, cwd } = options;

    const sandboxMode = process.env.CODEX_SANDBOX || 'danger-full-access';
    const sandboxPerms = process.env.CODEX_SANDBOX_PERMS ||
      '["network","process","disk-full-access"]';
    const approvalPolicy = process.env.CODEX_APPROVAL || 'never';
    const networkAccess = process.env.CODEX_NETWORK_ACCESS || 'true';
    const enableBypass = process.env.CODEX_BYPASS_SANDBOX !== 'false';

    // 1. 构建命令参数
    const args = [];
    if (enableBypass) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.push('--sandbox', sandboxMode, '--ask-for-approval', approvalPolicy);
    }
    args.push(
      '-c',
      `approval_policy="${approvalPolicy}"`,
      '-c',
      `sandbox_mode="${sandboxMode}"`,
      '-c',
      `sandbox_workspace_write.network_access=${networkAccess}`,
      '-c',
      `sandbox_permissions=${sandboxPerms}`,
      'exec',
      prompt
    );

    // 2. 确定工作目录
    const workingDir = cwd || projectPath || process.cwd();

    // 3. Codex CLI 路径
    const codexPath = 'node';
    const codexScript = '/home/ccp/codex-0.65.0/bin/codex.js';

    // 4. 加载 Token
    const token = await loadGaccodeToken();
    if (!token) {
      return reject(new Error('Failed to load CODEX_API_KEY'));
    }

    // 5. 设置环境变量
    const spawnEnv = {
      ...process.env,
      CODEX_API_KEY: token
    };

    console.log('[Codex] 🚀 Spawning:', codexScript);
    console.log('[Codex] 📁 Working dir:', workingDir);
    console.log('[Codex] 💬 Prompt:', prompt.substring(0, 50) + '...');

    // 6. 预注册进程
    const processKey = `codex-${Date.now()}`;
    activeCodexProcesses.set(processKey, 'pending');

    // 7. spawn 进程
    const codexProcess = spawn(codexPath, [codexScript, ...args], {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
      detached: true
    });

    activeCodexProcesses.set(processKey, codexProcess);

    let outputBuffer = '';
    let isFirstChunk = true;

    // 8. 处理标准输出
    codexProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputBuffer += chunk;

      // 过滤首次输出的头部信息
      if (isFirstChunk) {
        isFirstChunk = false;

        // 跳过 "OpenAI Codex v0.65.0..." 等头部
        const userMarker = '\nuser\n';
        const contentStart = chunk.indexOf(userMarker);

        if (contentStart !== -1) {
          // 跳过 user 提示词部分
          const thinkingStart = chunk.indexOf('\nthinking\n', contentStart);
          if (thinkingStart !== -1) {
            const cleanedChunk = chunk.substring(thinkingStart);
            if (writer && cleanedChunk.trim()) {
              writer.write(cleanedChunk);
            }
            return;
          }
        }
      }

      // 后续直接写入
      if (writer) {
        writer.write(chunk);
      }
    });

    // 9. 处理标准错误
    codexProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.error('[Codex stderr]:', errorMsg);

      // 检测常见错误
      if (errorMsg.includes('ERROR: Missing environment variable')) {
        console.error('[Codex] ❌ CODEX_API_KEY not set');
      } else if (errorMsg.includes('401 Unauthorized')) {
        console.error('[Codex] ❌ Token invalid or expired');
      } else if (errorMsg.includes('Reconnecting')) {
        console.warn('[Codex] ⚠️  API connection unstable');
      }

      // 将错误发送到飞书
      if (writer && errorMsg.includes('ERROR:')) {
        writer.write(`\n❌ ${errorMsg}\n`);
      }
    });

    // 10. 进程退出
    codexProcess.on('close', (code, signal) => {
      activeCodexProcesses.delete(processKey);

      if (signal) {
        reject(new Error(`Process killed by signal: ${signal}`));
      } else if (code === 0) {
        console.log('[Codex] ✅ Completed');
        resolve(outputBuffer);
      } else {
        reject(new Error(`Exit code ${code}`));
      }
    });

    codexProcess.on('error', (error) => {
      activeCodexProcesses.delete(processKey);
      reject(error);
    });
  });
}

/**
 * 中止 Codex 会话
 * @param {string} processKey - 进程键
 */
export function abortCodexSession(processKey) {
  const process = activeCodexProcesses.get(processKey);
  if (process && process !== 'pending') {
    try {
      // 使用负数 PID 终止整个进程组
      process.kill('SIGTERM');
      activeCodexProcesses.delete(processKey);
      console.log('[Codex] 🛑 Session aborted:', processKey);
    } catch (error) {
      console.error('[Codex] Failed to abort session:', error);
    }
  }
}

/**
 * 检查会话是否活跃
 * @param {string} processKey - 进程键
 * @returns {boolean}
 */
export function isCodexSessionActive(processKey) {
  return activeCodexProcesses.has(processKey);
}

// 单元测试（当直接运行此文件时）
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running unit tests...');

  loadGaccodeToken().then(token => {
    console.log('✅ Token loaded:', token ? '✅' : '❌');
    if (token) {
      console.log('Token preview:', token.substring(0, 20) + '...');
    }
    process.exit(token ? 0 : 1);
  });
}
