/**
 * Feishu Session Manager
 *
 * Manages Feishu conversation sessions, including:
 * - Session creation and tracking
 * - Project directory creation
 * - Integration with Claude CLI sessions
 * - Concurrency control
 */

import { feishuDb } from '../database/db.js';
import { addProjectManually } from '../projects.js';
import { isClaudeSessionActive } from '../claude-cli.js';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

export class FeishuSessionManager {
  constructor(userId, baseDir = './feicc', userNickname = null) {
    this.userId = userId; // User ID for database operations
    this.baseDir = baseDir; // Base directory for Feishu projects
    this.userNickname = userNickname; // User nickname for directory prefix
    console.log('[SessionManager] Initialized with base dir:', this.baseDir);
    if (userNickname) {
      console.log('[SessionManager] User nickname:', userNickname);
    }
  }

  /**
   * Get conversation ID from event
   * Returns: user-{open_id} or group-{chat_id}
   */
  getConversationId(event) {
    const message = event.message;
    if (!message) {
      throw new Error('No message in event');
    }

    const chatType = message.chat_type;
    const chatId = message.chat_id;
    const senderId = event.sender?.sender_id?.open_id;

    if (chatType === 'p2p') {
      // Private chat - use sender's open_id
      if (!senderId) {
        throw new Error('No sender ID in private chat');
      }
      return `user-${senderId}`;
    } else if (chatType === 'group') {
      // Group chat - use chat_id
      if (!chatId) {
        throw new Error('No chat ID in group chat');
      }
      return `group-${chatId}`;
    } else {
      throw new Error(`Unknown chat type: ${chatType}`);
    }
  }

  /**
   * Extract Feishu ID from event (open_id for private, chat_id for group)
   */
  getFeishuId(event) {
    const message = event.message;
    if (!message) {
      throw new Error('No message in event');
    }

    const chatType = message.chat_type;

    if (chatType === 'p2p') {
      const senderId = event.sender?.sender_id?.open_id;
      if (!senderId) {
        throw new Error('No sender ID in private chat');
      }
      return senderId;
    } else if (chatType === 'group') {
      const chatId = message.chat_id;
      if (!chatId) {
        throw new Error('No chat ID in group chat');
      }
      return chatId;
    } else {
      throw new Error(`Unknown chat type: ${chatType}`);
    }
  }

  /**
   * Get session type from event
   * Returns: 'private' or 'group'
   */
  getSessionType(event) {
    const message = event.message;
    if (!message) {
      throw new Error('No message in event');
    }

    const chatType = message.chat_type;
    if (chatType === 'p2p') {
      return 'private';
    } else if (chatType === 'group') {
      return 'group';
    } else {
      throw new Error(`Unknown chat type: ${chatType}`);
    }
  }

  /**
   * Get or create a session for the given event
   * If session doesn't exist:
   * 1. Create project directory
   * 2. Initialize git repository
   * 3. Register project with addProjectManually()
   * 4. Create session in database
   * @param {Object} event - Feishu event
   * @param {string} [userNickname] - Optional user nickname for directory prefix
   */
  async getOrCreateSession(event, userNickname = null) {
    const conversationId = this.getConversationId(event);
    const feishuId = this.getFeishuId(event);
    const sessionType = this.getSessionType(event);

    console.log('[SessionManager] Getting session for:', conversationId);

    // Check if session exists in database
    let session = feishuDb.getSession(conversationId);

    if (session) {
      console.log('[SessionManager] Existing session found:', session.id);

      // Check if claude_session_id is still valid (important after service restart)
      if (session.claude_session_id) {
        const isStillActive = isClaudeSessionActive(session.claude_session_id);
        console.log(`[SessionManager] Claude session ${session.claude_session_id} is ${isStillActive ? 'ACTIVE' : 'INACTIVE'}`);

        // If session is no longer active (e.g., after service restart), clear it
        if (!isStillActive) {
          console.log(`[SessionManager] ⚠️  Clearing stale Claude session ID: ${session.claude_session_id}`);
          console.log(`[SessionManager]   Reason: Session not in active processes (likely due to service restart)`);

          // Clear the stale claude_session_id
          this.updateClaudeSessionId(session.id, null);
          session.claude_session_id = null;
        }
      }

      // Update last activity
      feishuDb.updateSessionActivity(session.id);

      return session;
    }

    // Session doesn't exist - create new one
    console.log('[SessionManager] Creating new session for:', conversationId);

    // Create project directory path (conversation directories don't use nickname prefix)
    // Only new user-created project directories should use nickname prefix
    const directoryName = conversationId;
    const projectPath = path.join(this.baseDir, directoryName);
    const absolutePath = path.resolve(projectPath);

    // Create directory if it doesn't exist
    await this.ensureDirectoryExists(absolutePath);

    // Initialize git repository
    await this.initGitRepository(absolutePath);

    // Register project with Claude Code UI
    const displayName = `飞书${sessionType === 'private' ? '私聊' : '群聊'}-${feishuId.substring(0, 8)}`;
    console.log('[SessionManager] Registering project:', displayName);

    try {
      await addProjectManually(absolutePath, displayName);
      console.log('[SessionManager] Project registered successfully');
    } catch (error) {
      console.error('[SessionManager] Failed to register project:', error.message);
      // Continue anyway - not critical for session to work
    }

    // Create session in database
    console.log('[SessionManager] Creating session with params:', {
      conversationId,
      feishuId,
      sessionType,
      absolutePath,
      userId: this.userId,
      claudeSessionId: null
    });

    session = feishuDb.createSession(
      conversationId,
      feishuId,
      sessionType,
      absolutePath,
      this.userId,
      null // claudeSessionId will be set later
    );

    console.log('[SessionManager] Session created:', session.id);

    return session;
  }

  /**
   * Check if a session is busy (has active Claude process)
   */
  isSessionBusy(session) {
    if (!session || !session.claude_session_id) {
      return false;
    }

    const isActive = isClaudeSessionActive(session.claude_session_id);
    console.log('[SessionManager] Session busy check:', {
      sessionId: session.id,
      claudeSessionId: session.claude_session_id,
      isActive
    });

    return isActive;
  }

  /**
   * Update Claude session ID for a Feishu session
   */
  updateClaudeSessionId(sessionId, claudeSessionId) {
    feishuDb.updateClaudeSessionId(sessionId, claudeSessionId);
    console.log('[SessionManager] Updated Claude session ID:', {
      sessionId,
      claudeSessionId
    });
  }

  /**
   * Get all active sessions
   */
  getAllSessions() {
    return feishuDb.getAllSessions(this.userId);
  }

  /**
   * Get session statistics
   */
  getStats() {
    return feishuDb.getStats(this.userId);
  }

  /**
   * Ensure directory exists, create if not
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
      console.log('[SessionManager] Directory exists:', dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[SessionManager] Creating directory:', dirPath);
        await fs.mkdir(dirPath, { recursive: true });
        console.log('[SessionManager] Directory created');
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize git repository in directory
   */
  async initGitRepository(dirPath) {
    return new Promise((resolve, reject) => {
      // Check if already a git repository
      const checkGit = spawn('git', ['rev-parse', '--git-dir'], {
        cwd: dirPath,
        stdio: 'pipe'
      });

      checkGit.on('close', (code) => {
        if (code === 0) {
          // Already a git repository
          console.log('[SessionManager] Git repository already exists');
          resolve();
        } else {
          // Initialize new git repository
          console.log('[SessionManager] Initializing git repository...');

          const gitInit = spawn('git', ['init'], {
            cwd: dirPath,
            stdio: 'pipe'
          });

          let output = '';
          let errorOutput = '';

          gitInit.stdout.on('data', (data) => {
            output += data.toString();
          });

          gitInit.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          gitInit.on('close', (code) => {
            if (code === 0) {
              console.log('[SessionManager] Git repository initialized');
              console.log(output);
              resolve();
            } else {
              console.error('[SessionManager] Git init failed:', errorOutput);
              // Don't reject - git is optional
              resolve();
            }
          });

          gitInit.on('error', (error) => {
            console.error('[SessionManager] Git init error:', error.message);
            // Don't reject - git is optional
            resolve();
          });
        }
      });

      checkGit.on('error', (error) => {
        console.error('[SessionManager] Git check error:', error.message);
        // Assume git not installed or other error - skip git init
        resolve();
      });
    });
  }
}
