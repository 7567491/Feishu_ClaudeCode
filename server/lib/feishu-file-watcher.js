/**
 * Feishu File Watcher
 *
 * Monitors file changes in a directory and automatically sends changed .md files
 * to the active Feishu chat
 */

import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';

export class FeishuFileWatcher {
  constructor(watchPath, options = {}) {
    this.watchPath = watchPath;
    this.client = null;
    this.activeChatId = null;
    this.watcher = null;
    this.isRunning = false;

    // Options
    this.enabled = options.enabled !== false; // Default enabled
    this.sendAsDocument = options.sendAsDocument !== false; // Default: send as document
    this.debounceDelay = options.debounceDelay || 3000; // 3 seconds
    this.ignorePaths = options.ignorePaths || [
      '**/node_modules/**',
      '**/.git/**',
      '**/feicc/**', // Ignore session files
      '**/.claude/**',
      '**/dist/**',
      '**/build/**'
    ];

    // Debounce timers - keyed by file path
    this.pendingFiles = new Map();

    // Recently sent files to avoid duplicates
    this.recentlySent = new Set();
    this.recentlySentTTL = 60000; // 1 minute

    console.log('[FileWatcher] Initialized');
    console.log('[FileWatcher] Watch path:', this.watchPath);
    console.log('[FileWatcher] Enabled:', this.enabled);
    console.log('[FileWatcher] Send as document:', this.sendAsDocument);
  }

  /**
   * Set the Feishu client for sending files
   */
  setClient(client) {
    this.client = client;
    console.log('[FileWatcher] Client set');
  }

  /**
   * Update the active chat ID (called when user sends a message)
   */
  setActiveChatId(chatId) {
    this.activeChatId = chatId;
    console.log('[FileWatcher] Active chat updated:', chatId);
  }

  /**
   * Start watching files
   */
  start() {
    if (!this.enabled) {
      console.log('[FileWatcher] Disabled, not starting');
      return;
    }

    if (this.isRunning) {
      console.log('[FileWatcher] Already running');
      return;
    }

    console.log('[FileWatcher] Starting file watcher...');

    // Create watcher
    this.watcher = chokidar.watch('**/*.md', {
      cwd: this.watchPath,
      ignored: this.ignorePaths,
      persistent: true,
      ignoreInitial: true, // Don't trigger on initial scan
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    // Listen for file events
    this.watcher
      .on('add', (filePath) => this.handleFileChange(filePath, 'created'))
      .on('change', (filePath) => this.handleFileChange(filePath, 'modified'))
      .on('error', (error) => console.error('[FileWatcher] Error:', error))
      .on('ready', () => {
        this.isRunning = true;
        console.log('[FileWatcher] Ready and watching for changes');
      });
  }

  /**
   * Stop watching files
   */
  async stop() {
    if (!this.isRunning) {
      console.log('[FileWatcher] Not running');
      return;
    }

    console.log('[FileWatcher] Stopping...');

    // Clear pending timers
    for (const timer of this.pendingFiles.values()) {
      clearTimeout(timer);
    }
    this.pendingFiles.clear();

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isRunning = false;
    console.log('[FileWatcher] Stopped');
  }

  /**
   * Handle file change event (with debouncing)
   */
  handleFileChange(relativePath, changeType) {
    const fullPath = path.join(this.watchPath, relativePath);

    console.log(`[FileWatcher] File ${changeType}:`, relativePath);

    // Check if we have an active chat
    if (!this.activeChatId) {
      console.log('[FileWatcher] No active chat, skipping auto-send');
      return;
    }

    // Check if file was recently sent
    const fileKey = `${fullPath}:${changeType}`;
    if (this.recentlySent.has(fileKey)) {
      console.log('[FileWatcher] File recently sent, skipping to avoid duplicate');
      return;
    }

    // Clear existing timer for this file
    if (this.pendingFiles.has(fullPath)) {
      clearTimeout(this.pendingFiles.get(fullPath));
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.sendFile(fullPath, relativePath, changeType);
      this.pendingFiles.delete(fullPath);
    }, this.debounceDelay);

    this.pendingFiles.set(fullPath, timer);
  }

  /**
   * Send file to active chat (as file attachment or as Feishu document)
   */
  async sendFile(fullPath, relativePath, changeType) {
    if (!this.client || !this.activeChatId) {
      console.log('[FileWatcher] Cannot send: no client or active chat');
      return;
    }

    try {
      console.log('[FileWatcher] Auto-sending file:', relativePath);

      // Check if file still exists
      if (!fs.existsSync(fullPath)) {
        console.log('[FileWatcher] File no longer exists, skipping');
        return;
      }

      // Get file stats
      const stats = fs.statSync(fullPath);
      const sizeKB = (stats.size / 1024).toFixed(2);

      // Determine send method
      if (this.sendAsDocument) {
        // Send as Feishu document
        await this.sendAsFeishuDocument(fullPath, relativePath, changeType, sizeKB);
      } else {
        // Send as file attachment
        await this.sendAsFileAttachment(fullPath, relativePath, changeType, sizeKB);
      }

      // Mark as recently sent
      const fileKey = `${fullPath}:${changeType}`;
      this.recentlySent.add(fileKey);
      setTimeout(() => {
        this.recentlySent.delete(fileKey);
      }, this.recentlySentTTL);

      console.log('[FileWatcher] File sent successfully');

    } catch (error) {
      console.error('[FileWatcher] Failed to send file:', error.message);

      // Try to notify user about the error
      try {
        await this.client.sendTextMessage(
          this.activeChatId,
          `❌ 自动发送失败: ${error.message}`
        );
      } catch (notifyError) {
        console.error('[FileWatcher] Failed to send error notification:', notifyError.message);
      }
    }
  }

  /**
   * Send file as Feishu document (create document from markdown)
   */
  async sendAsFeishuDocument(fullPath, relativePath, changeType, sizeKB) {
    try {
      // Send notification message
      const emoji = changeType === 'created' ? '📝' : '✏️';
      const action = changeType === 'created' ? '新建' : '修改';
      await this.client.sendTextMessage(
        this.activeChatId,
        `${emoji} 检测到文件${action}: ${relativePath} (${sizeKB}KB)\n正在创建飞书文档...`
      );

      // Read file content
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Get document title from filename (remove .md extension)
      const title = path.basename(relativePath, '.md');

      // Create Feishu document from markdown
      console.log('[FileWatcher] Creating Feishu document:', title);
      const doc = await this.client.createDocumentFromMarkdown(title, content);

      // Send document link
      await this.client.sendDocumentLink(this.activeChatId, doc.document_id, title);

      console.log('[FileWatcher] Document created and link sent:', doc.url);

    } catch (error) {
      console.error('[FileWatcher] Failed to create document:', error.message);
      throw error;
    }
  }

  /**
   * Send file as file attachment (original behavior)
   */
  async sendAsFileAttachment(fullPath, relativePath, changeType, sizeKB) {
    try {
      // Send notification message
      const emoji = changeType === 'created' ? '📝' : '✏️';
      const action = changeType === 'created' ? '新建' : '修改';
      await this.client.sendTextMessage(
        this.activeChatId,
        `${emoji} 检测到文件${action}: ${relativePath} (${sizeKB}KB)\n正在自动发送...`
      );

      // Send the file
      await this.client.sendFile(this.activeChatId, fullPath);

      console.log('[FileWatcher] File attachment sent');

    } catch (error) {
      console.error('[FileWatcher] Failed to send file attachment:', error.message);
      throw error;
    }
  }

  /**
   * Get watcher status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      sendAsDocument: this.sendAsDocument,
      isRunning: this.isRunning,
      watchPath: this.watchPath,
      activeChatId: this.activeChatId,
      pendingFiles: Array.from(this.pendingFiles.keys())
    };
  }
}
