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

    // Get Claude CLI path from environment or use default
    const claudeCliPath = process.env.CLAUDE_CLI_PATH || 'claude';

    // Load gaccode authentication token
    const gaccodeToken = await loadGaccodeToken();

    // Prepare environment variables
    const spawnEnv = { ...process.env };
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

    const claudeProcess = spawnFunction(claudeCliPath, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv // Pass environment variables including CLAUDECODE_TOKEN
    });

    // Store process reference for potential abort
    const processKey = capturedSessionId || Date.now().toString();
    activeClaudeProcesses.set(processKey, claudeProcess);

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
    claudeProcess.on('close', async (code) => {
      console.log(`Claude CLI process exited with code ${code}`);

      // Clean up process reference
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeClaudeProcesses.delete(finalSessionId);

      ws.send(JSON.stringify({
        type: 'claude-complete',
        sessionId: finalSessionId,
        exitCode: code,
        isNewSession: !sessionId && !!command // Flag to indicate this was a new session
      }));

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude CLI exited with code ${code}`));
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
