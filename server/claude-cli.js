import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Use cross-spawn on Windows for better command execution
const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

let activeClaudeProcesses = new Map(); // Track active processes by session ID

/**
 * Load gaccode authentication token from ~/.claudecode/config
 * @returns {Promise<string|null>} Token or null if not found
 */
async function loadGaccodeToken() {
  try {
    const configPath = path.join(os.homedir(), '.claudecode', 'config');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    return config.token || null;
  } catch (error) {
    console.log('ℹ️  No gaccode token found in ~/.claudecode/config');
    return null;
  }
}

async function queryClaude(command, options = {}, ws) {
  return new Promise(async (resolve, reject) => {
    const { sessionId, projectPath, cwd, resume, toolsSettings, skipPermissions, model, images, permissionMode } = options;
    let capturedSessionId = sessionId; // Track session ID throughout the process
    let sessionCreatedSent = false; // Track if we've already sent session-created event
    let messageBuffer = ''; // Buffer for accumulating assistant messages

    // Use tools settings passed from frontend, or defaults
    const settings = toolsSettings || {
      allowedTools: [],
      disallowedTools: [],
      skipPermissions: false
    };

    // Build Claude CLI command
    const args = ['-p']; // Always use print mode for non-interactive output

    // Build flags allowing both resume and prompt together (reply in existing session)
    // Treat presence of sessionId as intention to resume, regardless of resume flag
    if (sessionId) {
      args.push('--resume=' + sessionId);
    }

    if (command && command.trim()) {
      // Request streaming JSON (gaccode version requires --verbose)
      args.push('--output-format', 'stream-json', '--verbose');
    }

    // Add permission mode if specified
    if (permissionMode && permissionMode !== 'default') {
      args.push('--permission-mode', permissionMode);
    }

    // Add skip permissions flag if enabled
    if (skipPermissions || settings.skipPermissions) {
      args.push('--dangerously-skip-permissions');
      console.log('⚠️  Using --dangerously-skip-permissions flag');
    }

    // Add allowed tools
    if (settings.allowedTools && settings.allowedTools.length > 0) {
      args.push('--allowed-tools', settings.allowedTools.join(','));
      console.log('🔧 Allowed tools:', settings.allowedTools.join(','));
    }

    // Add disallowed tools
    if (settings.disallowedTools && settings.disallowedTools.length > 0) {
      args.push('--disallowed-tools', settings.disallowedTools.join(','));
      console.log('🚫 Disallowed tools:', settings.disallowedTools.join(','));
    }

    // Add model flag if specified
    if (model) {
      args.push('--model', model);
    }

    // Add the prompt as the last argument
    if (command && command.trim()) {
      args.push(command);
    }

    // Use cwd (actual project directory) instead of projectPath
    const workingDir = cwd || projectPath || process.cwd();

    // Get Claude CLI path with fallback，避免 ENOENT
    let claudeCliPath = process.env.CLAUDE_CLI_PATH || '/usr/bin/claude';
    try {
      await fs.access(claudeCliPath);
    } catch {
      claudeCliPath = 'claude'; // 回退到 PATH
    }

    // Load gaccode authentication token
    const gaccodeToken = await loadGaccodeToken();

    // Prepare environment variables
    const spawnEnv = { ...process.env };

    // Set TMPDIR to dedicated log directory for claude temp files (including cwd files)
    const claudeLogDir = path.join(os.homedir(), '.claude-logs');
    try {
      await fs.mkdir(claudeLogDir, { recursive: true });
      spawnEnv.TMPDIR = claudeLogDir;
    } catch (error) {
      console.log('⚠️  Failed to create claude log directory:', error);
    }

    if (gaccodeToken) {
      spawnEnv.CLAUDECODE_TOKEN = gaccodeToken;
      console.log('🔐 Loaded gaccode authentication token');
    }

    console.log('🚀 Spawning Claude CLI:', claudeCliPath);
    console.log('📝 Args:', args.slice(0, -1).join(' '), '[prompt]');
    console.log('📁 Working directory:', workingDir);
    console.log('🔑 Session info - Input sessionId:', sessionId, 'Resume:', resume);
    console.log('🌐 ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL);
    console.log('🏠 HOME:', process.env.HOME);
    console.log('👤 USER:', process.env.USER);

    // Register process BEFORE spawning to prevent race condition
    // Use sessionId if available (for resume), otherwise generate temporary key
    const processKey = sessionId || `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Log session resume attempt for debugging
    if (sessionId) {
      console.log(`🔄 Attempting to resume session: ${sessionId}`);
      console.log(`📊 Current active sessions: ${Array.from(activeClaudeProcesses.keys()).join(', ')}`);
    }

    // Pre-register with a placeholder to prevent concurrent requests
    // This eliminates the race window between spawn and activeClaudeProcesses.set()
    activeClaudeProcesses.set(processKey, 'pending');
    console.log(`📝 Pre-registered session key: ${processKey}`);

    const claudeProcess = spawnFunction(claudeCliPath, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv // Pass environment variables including CLAUDECODE_TOKEN
    });

    // Update with actual process object
    activeClaudeProcesses.set(processKey, claudeProcess);
    console.log(`✅ Process spawned and registered for: ${processKey}`);

    // Handle stdout (streaming JSON responses)
    claudeProcess.stdout.on('data', (data) => {
      const rawOutput = data.toString();
      console.log('📤 Claude CLI stdout:', rawOutput);

      const lines = rawOutput.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          console.log('📄 Parsed JSON response type:', response.type);

          // Handle different message types
          switch (response.type) {
            case 'system':
              if (response.subtype === 'init') {
                // Capture session ID
                if (response.session_id && !capturedSessionId) {
                  capturedSessionId = response.session_id;
                  console.log('📝 Captured session ID:', capturedSessionId);

                  // Update process key with captured session ID
                  if (processKey !== capturedSessionId) {
                    activeClaudeProcesses.delete(processKey);
                    activeClaudeProcesses.set(capturedSessionId, claudeProcess);
                  }

                  // Set session ID on writer (for API endpoint compatibility)
                  if (ws.setSessionId && typeof ws.setSessionId === 'function') {
                    ws.setSessionId(capturedSessionId);
                  }

                  // Send session-created event only once for new sessions
                  if (!sessionId && !sessionCreatedSent) {
                    sessionCreatedSent = true;
                    ws.send(JSON.stringify({
                      type: 'session-created',
                      sessionId: capturedSessionId,
                      model: response.model,
                      cwd: response.cwd
                    }));
                  }
                }
              }
              break;

            case 'user':
              // Forward user message as claude-response
              ws.send(JSON.stringify({
                type: 'claude-response',
                data: response
              }));
              break;

            case 'assistant':
            case 'content_block_delta':
            case 'text_delta':
              // Forward assistant messages
              ws.send(JSON.stringify({
                type: 'claude-response',
                data: response
              }));
              break;

            case 'result':
              // Session complete
              console.log('Claude session result:', response);

              // Send completion event
              ws.send(JSON.stringify({
                type: 'claude-response',
                data: response
              }));
              break;

            default:
              // Forward any other message types
              ws.send(JSON.stringify({
                type: 'claude-response',
                data: response
              }));
          }
        } catch (parseError) {
          console.log('📄 Non-JSON response:', line);
          // If not JSON, send as raw text
          ws.send(JSON.stringify({
            type: 'claude-output',
            data: line
          }));
        }
      }
    });

    // Handle stderr
    claudeProcess.stderr.on('data', (data) => {
      console.error('Claude CLI stderr:', data.toString());
      ws.send(JSON.stringify({
        type: 'claude-error',
        error: data.toString()
      }));
    });

    // Handle process completion
    claudeProcess.on('close', async (code, signal) => {
      // Log exit information with signal details
      const finalSessionId = capturedSessionId || sessionId || processKey;

      if (signal) {
        console.log(`⚠️  Claude CLI process terminated by signal: ${signal}`);
        console.log(`   📌 Session ID: ${finalSessionId}`);
        console.log(`   📌 Original session ID: ${sessionId || 'new session'}`);
        console.log(`   📌 Captured session ID: ${capturedSessionId || 'not captured yet'}`);
        console.log(`   📌 Exit code: ${code}`);
      } else {
        console.log(`Claude CLI process exited with code ${code}`);
        console.log(`   📌 Session ID: ${finalSessionId}`);
      }

      // Clean up process reference
      activeClaudeProcesses.delete(finalSessionId);

      // Clean up temporary cwd files in log directory
      try {
        const claudeLogDir = path.join(os.homedir(), '.claude-logs');
        const files = await fs.readdir(claudeLogDir);
        const cwdFiles = files.filter(f => f.startsWith('claude-') && f.endsWith('-cwd'));
        for (const file of cwdFiles) {
          await fs.unlink(path.join(claudeLogDir, file)).catch(() => {});
        }
        if (cwdFiles.length > 0) {
          console.log(`🧹 Cleaned up ${cwdFiles.length} temporary cwd file(s)`);
        }
      } catch (error) {
        // Ignore cleanup errors
      }

      ws.send(JSON.stringify({
        type: 'claude-complete',
        sessionId: finalSessionId,
        exitCode: code,
        signal,
        isNewSession: !sessionId && !!command // Flag to indicate this was a new session
      }));

      if (code === 0) {
        resolve();
      } else {
        // Provide clear error message based on exit condition
        let errorMessage;
        if (signal) {
          errorMessage = `Claude CLI was terminated by signal ${signal}`;
          // Add user-friendly explanations for common signals
          if (signal === 'SIGTERM') {
            errorMessage += ' (进程被正常终止，可能是因为会话被取消或系统重启)';
          } else if (signal === 'SIGINT') {
            errorMessage += ' (进程被用户中断)';
          } else if (signal === 'SIGKILL') {
            errorMessage += ' (进程被强制终止，可能是系统资源不足)';
          }
        } else if (code === null) {
          errorMessage = 'Claude CLI exited abnormally (可能是并发请求冲突或进程被外部终止)';
        } else {
          errorMessage = `Claude CLI exited with code ${code}`;
        }
        reject(new Error(errorMessage));
      }
    });

    // Handle process errors
    claudeProcess.on('error', (error) => {
      console.error('Claude CLI process error:', error);

      // Clean up process reference on error
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeClaudeProcesses.delete(finalSessionId);

      ws.send(JSON.stringify({
        type: 'claude-error',
        error: error.message
      }));

      reject(error);
    });

    // Close stdin since Claude doesn't need interactive input in print mode
    claudeProcess.stdin.end();
  });
}

function abortClaudeSession(sessionId) {
  const process = activeClaudeProcesses.get(sessionId);
  if (process) {
    console.log(`🛑 Aborting Claude session: ${sessionId}`);
    // Check if it's still in pending state (before process fully spawned)
    if (process === 'pending') {
      console.log(`⚠️  Session ${sessionId} is still pending, removing from queue`);
      activeClaudeProcesses.delete(sessionId);
      return true;
    }
    // Kill the actual process
    process.kill('SIGTERM');
    activeClaudeProcesses.delete(sessionId);
    return true;
  }
  return false;
}

function isClaudeSessionActive(sessionId) {
  return activeClaudeProcesses.has(sessionId);
}

function getActiveClaudeSessions() {
  return Array.from(activeClaudeProcesses.keys());
}

export {
  queryClaude,
  abortClaudeSession,
  isClaudeSessionActive,
  getActiveClaudeSessions
};
