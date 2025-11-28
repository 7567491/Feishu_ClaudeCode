/**
 * Feishu Message Writer
 *
 * Implements a writer compatible with queryClaude's ws.send() interface.
 * Accumulates Claude's streaming output and sends to Feishu in chunks.
 */

import { FeishuFileHandler } from './feishu-file-handler.js';

export class FeishuMessageWriter {
  constructor(feishuClient, chatId, sessionId = null, projectPath = null) {
    this.feishuClient = feishuClient; // Feishu client instance
    this.chatId = chatId; // Feishu chat_id or open_id
    this.sessionId = sessionId; // Claude session ID (set later)
    this.projectPath = projectPath; // Project root for resolving files

    this.buffer = ''; // Accumulated text buffer
    this.collectedText = ''; // Full text for post-processing
    this.lastFlushTime = Date.now(); // Last time we sent a message
    this.flushInterval = 3000; // 3 seconds
    this.flushThreshold = 2000; // 2000 characters

    this.isCompleted = false; // Whether session is completed
    this.flushTimer = null; // Auto-flush timer

    console.log('[FeishuWriter] Initialized for chat:', chatId);
  }

  /**
   * Set session ID (called by queryClaude when session is created)
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
    console.log('[FeishuWriter] Session ID set:', sessionId);
  }

  /**
   * Main send method - compatible with ws.send() interface
   * Receives JSON strings from queryClaude
   */
  send(data) {
    try {
      // Parse the message
      const message = typeof data === 'string' ? JSON.parse(data) : data;

      // Handle different message types
      switch (message.type) {
        case 'session-created':
          this.handleSessionCreated(message);
          break;

        case 'claude-response':
          this.handleClaudeResponse(message.data);
          break;

        case 'claude-output':
          this.handleClaudeOutput(message.data);
          break;

        case 'claude-error':
          this.handleError(message.error);
          break;

        default:
          console.log('[FeishuWriter] Unknown message type:', message.type);
      }

      // Auto-flush if needed
      this.flushIfNeeded();

    } catch (error) {
      console.error('[FeishuWriter] Error processing message:', error.message);
    }
  }

  /**
   * Handle session-created event
   */
  handleSessionCreated(message) {
    if (message.sessionId) {
      this.setSessionId(message.sessionId);
    }
    console.log('[FeishuWriter] Session created:', message);
  }

  /**
   * Handle Claude response data
   */
  handleClaudeResponse(data) {
    if (!data) return;

    // Extract text content from different response types
    switch (data.type) {
      case 'assistant':
      case 'assistant_message':
        // Assistant message from Claude CLI - extract text from message.content
        if (data.message?.content && Array.isArray(data.message.content)) {
          for (const block of data.message.content) {
            // Add null/undefined check to prevent "Cannot read properties of null" errors
            if (block && block.type === 'text' && block.text) {
              this.appendText(block.text);
            }
          }
        } else if (data.text) {
          this.appendText(data.text);
        }
        break;

      case 'content_block_delta':
      case 'text_delta':
        // Streaming text delta
        if (data.delta?.text) {
          this.appendText(data.delta.text);
        } else if (data.text) {
          this.appendText(data.text);
        }
        break;

      case 'result':
        // Session completed - don't extract result text here
        // The text has already been extracted from the assistant message
        console.log('[FeishuWriter] Session completed');
        this.isCompleted = true;
        break;

      default:
        // Other types - just log
        console.log('[FeishuWriter] Claude response:', data.type);
    }
  }

  /**
   * Handle raw Claude output
   */
  handleClaudeOutput(data) {
    if (data && typeof data === 'string') {
      this.appendText(data);
    }
  }

  /**
   * Handle error messages
   */
  handleError(error) {
    console.error('[FeishuWriter] Claude error:', error);
    this.appendText(`\n⚠️ Error: ${error}\n`);
  }

  /**
   * Append text to buffer
   */
  appendText(text) {
    this.buffer += text;
    this.collectedText += text;
    console.log('[FeishuWriter] Buffer size:', this.buffer.length);
  }

  /**
   * Check if we should flush the buffer
   */
  flushIfNeeded() {
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    const shouldFlushByTime = timeSinceLastFlush >= this.flushInterval;
    const shouldFlushBySize = this.buffer.length >= this.flushThreshold;

    if (shouldFlushByTime || shouldFlushBySize) {
      this.flush();
    } else {
      // Schedule auto-flush if not already scheduled
      if (!this.flushTimer) {
        const remainingTime = this.flushInterval - timeSinceLastFlush;
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          if (this.buffer.length > 0) {
            this.flush();
          }
        }, remainingTime);
      }
    }
  }

  /**
   * Flush the buffer to Feishu
   */
  async flush() {
    if (this.buffer.length === 0) return;

    // Clear auto-flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const textToSend = this.buffer;
    this.buffer = ''; // Clear buffer
    this.lastFlushTime = Date.now();

    console.log(`[FeishuWriter] Flushing ${textToSend.length} characters...`);

    try {
      // Split into chunks if too long (Feishu has message length limits)
      const chunks = this.splitMessage(textToSend);

      for (const chunk of chunks) {
        await this.feishuClient.sendTextMessage(this.chatId, chunk);

        // Small delay between chunks to avoid rate limiting
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log('[FeishuWriter] Flush completed');
    } catch (error) {
      console.error('[FeishuWriter] Failed to send message:', error.message);
      // Put the text back in buffer for retry
      this.buffer = textToSend + this.buffer;
    }
  }

  /**
   * Split long messages into chunks
   * Feishu text message limit is ~30000 characters, but we use 5000 for safety
   */
  splitMessage(text, maxLength = 5000) {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline or space near the maxLength
      let splitIndex = maxLength;
      const nearbyNewline = remaining.lastIndexOf('\n', maxLength);
      const nearbySpace = remaining.lastIndexOf(' ', maxLength);

      if (nearbyNewline > maxLength * 0.8) {
        splitIndex = nearbyNewline + 1;
      } else if (nearbySpace > maxLength * 0.8) {
        splitIndex = nearbySpace + 1;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex);
    }

    return chunks;
  }

  /**
   * Complete the message stream
   * Flush any remaining content
   */
  async complete() {
    console.log('[FeishuWriter] Completing message stream...');

    // Clear auto-flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining content
    if (this.buffer.length > 0) {
      await this.flush();
    }

    // Auto-send mentioned markdown files after all text flushed
    await this.sendMentionedMarkdownFiles();

    console.log('[FeishuWriter] Message stream completed');
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = '';
    console.log('[FeishuWriter] Destroyed');
  }

  /**
   * Send a file to the chat
   * @param {string} filePath - Path to the file to send
   * @returns {Promise<void>}
   */
  async sendFile(filePath) {
    console.log('[FeishuWriter] Sending file:', filePath);

    try {
      // Flush any pending text first
      if (this.buffer.length > 0) {
        await this.flush();
      }

      // Send the file using the client
      const result = await this.feishuClient.sendFile(this.chatId, filePath);

      console.log('[FeishuWriter] File sent successfully:', result.file_name);
      return result;

    } catch (error) {
      console.error('[FeishuWriter] Failed to send file:', error.message);
      throw error;
    }
  }

  /**
   * Detect and send any markdown files mentioned in the response text
   */
  async sendMentionedMarkdownFiles() {
    if (!this.projectPath || !this.collectedText) return;

    try {
      const matches = this.collectedText.match(/\b[^\s`'"<>]+\.(md)\b/gi);
      if (!matches) return;

      const uniqueFiles = [...new Set(matches.map((name) => name.replace(/[，。,.;:]+$/, '')))];

      for (const fileName of uniqueFiles) {
        const filePath = FeishuFileHandler.findFile(this.projectPath, fileName);
        if (!filePath) {
          console.log('[FeishuWriter] Mentioned markdown not found:', fileName);
          continue;
        }

        await this.feishuClient.sendTextMessage(
          this.chatId,
          `📄 检测到引用 ${fileName}，正在发送...`
        );
        await this.sendFile(filePath);
      }
    } catch (error) {
      console.error('[FeishuWriter] Failed to send mentioned markdown files:', error.message);
    }
  }
}
