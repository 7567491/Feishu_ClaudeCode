/**
 * Feishu Client
 *
 * Encapsulates Lark SDK for WebSocket connection and message handling.
 * Uses long-lived WebSocket connection (no public domain needed).
 */

import lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';

export class FeishuClient {
  constructor(config) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.loggerLevel = config.loggerLevel || lark.LoggerLevel.error;

    // Create Lark Client for API calls
    this.client = new lark.Client({
      appId: this.appId,
      appSecret: this.appSecret,
      domain: lark.Domain.Feishu
    });

    // Create WebSocket Client for event listening
    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: this.loggerLevel
    });

    this.isRunning = false;
    this.messageHandler = null;
    this.botInfo = null; // Bot's own info (to identify mentions)

    console.log('[FeishuClient] Initialized with App ID:', this.appId);
  }

  /**
   * Start the WebSocket connection and listen for messages
   */
  async start(messageHandler) {
    if (this.isRunning) {
      console.log('[FeishuClient] Already running');
      return;
    }

    this.messageHandler = messageHandler;

    // Get bot info
    await this.getBotInfo();

    // Create EventDispatcher and register message handler
    const eventDispatcher = new lark.EventDispatcher({
      loggerLevel: lark.LoggerLevel.debug
    }).register({
      'im.message.receive_v1': async (data) => {
        console.log('[FeishuClient] ✨ EventDispatcher received im.message.receive_v1');
        console.log('[FeishuClient] Raw event data:', JSON.stringify(data, null, 2).substring(0, 500));
        await this.handleMessageEvent(data);
      }
    });

    // Start WebSocket connection with EventDispatcher
    try {
      await this.wsClient.start({ eventDispatcher });
      this.isRunning = true;
      console.log('[FeishuClient] WebSocket started successfully');
    } catch (error) {
      console.error('[FeishuClient] Failed to start WebSocket:', error.message);
      throw error;
    }
  }

  /**
   * Stop the WebSocket connection
   * Note: New SDK version doesn't provide stop() method, connection is managed automatically
   */
  async stop() {
    if (!this.isRunning) {
      console.log('[FeishuClient] Not running');
      return;
    }

    // Mark as not running (SDK will handle reconnection automatically)
    this.isRunning = false;
    console.log('[FeishuClient] WebSocket marked as stopped');
  }


  /**
   * Handle incoming message event
   */
  async handleMessageEvent(data) {
    try {
      const event = data.event || data;

      console.log('[FeishuClient] Received message:');
      console.log('  Message ID:', event.message?.message_id);
      console.log('  Chat ID:', event.message?.chat_id);
      console.log('  Chat Type:', event.message?.chat_type);
      console.log('  Sender:', event.sender?.sender_id?.open_id);

      // Check if this message is for the bot
      if (!this.isMessageForBot(event)) {
        console.log('[FeishuClient] Message not for bot, skipping');
        return;
      }

      // Extract message content
      const content = event.message?.content;
      if (!content) {
        console.log('[FeishuClient] No content in message');
        return;
      }

      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
      } catch (error) {
        console.error('[FeishuClient] Failed to parse message content:', error.message);
        return;
      }

      // Extract text from different message types
      let userText = '';
      if (parsedContent.text) {
        userText = parsedContent.text;
      } else if (parsedContent.content) {
        userText = parsedContent.content;
      }

      // Remove @mentions from text (for group chats)
      userText = this.cleanMentions(userText);

      if (!userText || !userText.trim()) {
        console.log('[FeishuClient] Empty message after cleaning');
        return;
      }

      console.log('[FeishuClient] User text:', userText);

      // Call message handler
      if (this.messageHandler) {
        await this.messageHandler(event, userText.trim());
      }

    } catch (error) {
      console.error('[FeishuClient] Error handling message:', error.message);
      console.error(error.stack);
    }
  }

  /**
   * Check if a message is for the bot
   * Returns true for:
   * - Private chats (chat_type === 'p2p')
   * - Group chats where bot is mentioned
   */
  isMessageForBot(event) {
    const message = event.message;
    if (!message) return false;

    // Private chat - always for bot
    if (message.chat_type === 'p2p') {
      return true;
    }

    // Group chat - check for mentions
    if (message.chat_type === 'group') {
      const mentions = message.mentions;
      if (!mentions || mentions.length === 0) {
        return false;
      }

      // Check if bot is mentioned
      // If we have bot's open_id, check for exact match
      // Otherwise, accept any @ mention as potentially for us
      if (this.botInfo?.open_id) {
        for (const mention of mentions) {
          if (mention.id?.open_id === this.botInfo.open_id) {
            return true;
          }
          if (mention.key === '@_all') {
            return true;
          }
        }
        return false;
      } else {
        // No bot info - accept any mention
        return true;
      }
    }

    // Unknown chat type
    return false;
  }

  /**
   * Clean @mentions from text
   */
  cleanMentions(text) {
    if (!text) return '';

    // Remove @user_name format (e.g., "@Bot ")
    let cleaned = text.replace(/@[^\s]+\s*/g, '');

    // Remove at-mention markers used by Feishu
    cleaned = cleaned.replace(/@_user_\d+/g, '');
    cleaned = cleaned.replace(/@_all/g, '');

    return cleaned.trim();
  }

  /**
   * Get bot's own information
   */
  async getBotInfo() {
    try {
      // For mentions to work properly, we would need bot info
      // But it's not critical for basic functionality
      // Set a placeholder for now
      this.botInfo = { open_id: null };
      console.log('[FeishuClient] Bot info: mentions will match any @');
    } catch (error) {
      console.error('[FeishuClient] Failed to get bot info:', error.message);
      this.botInfo = { open_id: null };
    }
  }

  /**
   * Send a text message to a chat
   */
  async sendTextMessage(chatId, text, retries = 3) {
    const receiveIdType = chatId.startsWith('oc_') ? 'chat_id' : 'open_id';

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await this.client.im.message.create({
          params: {
            receive_id_type: receiveIdType
          },
          data: {
            receive_id: chatId,
            content: JSON.stringify({ text }),
            msg_type: 'text'
          }
        });

        if (res.code === 0) {
          console.log('[FeishuClient] Message sent successfully');
          return {
            success: true,
            message_id: res.data?.message_id
          };
        } else {
          throw new Error(`Feishu API error: ${res.code} - ${res.msg}`);
        }

      } catch (error) {
        console.error(`[FeishuClient] Send message failed (attempt ${attempt}/${retries}):`, error.message);

        if (attempt === retries) {
          throw error; // Re-throw on final attempt
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Send a reply to a specific message
   */
  async replyToMessage(messageId, text, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await this.client.im.message.reply({
          path: {
            message_id: messageId
          },
          data: {
            content: JSON.stringify({ text }),
            msg_type: 'text'
          }
        });

        if (res.code === 0) {
          console.log('[FeishuClient] Reply sent successfully');
          return {
            success: true,
            message_id: res.data?.message_id
          };
        } else {
          throw new Error(`Feishu API error: ${res.code} - ${res.msg}`);
        }

      } catch (error) {
        console.error(`[FeishuClient] Reply failed (attempt ${attempt}/${retries}):`, error.message);

        if (attempt === retries) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      botInfo: this.botInfo
    };
  }

  /**
   * Upload a file to Feishu
   * @param {string} filePath - Path to the file to upload
   * @returns {Promise<{file_key: string, file_name: string}>}
   */
  async uploadFile(filePath) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // Check file size (20MB limit for safety)
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (stats.size > maxSize) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max 20MB)`);
      }

      console.log('[FeishuClient] Uploading file:', fileName, `(${(stats.size / 1024).toFixed(2)}KB)`);

      // Create file stream
      const fileStream = fs.createReadStream(filePath);

      // Upload file using Lark SDK
      const res = await this.client.im.file.create({
        data: {
          file_type: 'stream',
          file_name: fileName,
          file: fileStream
        }
      });

      // SDK returns data directly on success, throws error on failure
      if (res && res.file_key) {
        console.log('[FeishuClient] File uploaded successfully, file_key:', res.file_key);
        return {
          file_key: res.file_key,
          file_name: fileName
        };
      } else {
        throw new Error(`Unexpected response format: ${JSON.stringify(res)}`);
      }

    } catch (error) {
      console.error('[FeishuClient] Failed to upload file:', error.message);
      throw error;
    }
  }

  /**
   * Send a file message to a chat
   * @param {string} chatId - Chat ID or Open ID
   * @param {string} fileKey - File key returned from uploadFile
   * @param {string} fileName - Original file name (for logging)
   * @returns {Promise<{success: boolean, message_id: string}>}
   */
  async sendFileMessage(chatId, fileKey, fileName = 'file') {
    const receiveIdType = chatId.startsWith('oc_') ? 'chat_id' : 'open_id';

    try {
      console.log('[FeishuClient] Sending file message:', fileName);

      const res = await this.client.im.message.create({
        params: {
          receive_id_type: receiveIdType
        },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ file_key: fileKey }),
          msg_type: 'file'
        }
      });

      if (res.code === 0) {
        console.log('[FeishuClient] File message sent successfully');
        return {
          success: true,
          message_id: res.data?.message_id
        };
      } else {
        throw new Error(`Feishu API error: ${res.code} - ${res.msg}`);
      }

    } catch (error) {
      console.error('[FeishuClient] Failed to send file message:', error.message);
      throw error;
    }
  }

  /**
   * Upload and send a file in one operation
   * @param {string} chatId - Chat ID or Open ID
   * @param {string} filePath - Path to the file to send
   * @returns {Promise<{success: boolean, message_id: string, file_key: string}>}
   */
  async sendFile(chatId, filePath) {
    try {
      // Upload file first
      const { file_key, file_name } = await this.uploadFile(filePath);

      // Then send file message
      const result = await this.sendFileMessage(chatId, file_key, file_name);

      return {
        ...result,
        file_key,
        file_name
      };

    } catch (error) {
      console.error('[FeishuClient] Failed to send file:', error.message);
      throw error;
    }
  }

  /**
   * Create a new Feishu document
   * @param {string} title - Document title
   * @param {string} folderToken - Parent folder token (optional, will use root if not provided)
   * @returns {Promise<{document_id: string, revision_id: number, url: string}>}
   */
  async createDocument(title, folderToken = null) {
    try {
      console.log('[FeishuClient] Creating document:', title);

      const data = { title };
      if (folderToken) {
        data.folder_token = folderToken;
      }

      const res = await this.client.docx.document.create({ data });

      if (res.code === 0) {
        const documentId = res.data.document.document_id;
        const revisionId = res.data.document.revision_id;
        const url = `https://feishu.cn/docx/${documentId}`;

        console.log('[FeishuClient] Document created successfully');
        console.log('  - Document ID:', documentId);
        console.log('  - URL:', url);

        return {
          document_id: documentId,
          revision_id: revisionId,
          url
        };
      } else {
        throw new Error(`Failed to create document: ${res.code} - ${res.msg}`);
      }

    } catch (error) {
      console.error('[FeishuClient] Failed to create document:', error.message);
      throw error;
    }
  }

  /**
   * Add markdown content to a document by converting to blocks
   * @param {string} documentId - Document ID
   * @param {string} markdownContent - Markdown content to add
   * @returns {Promise<void>}
   */
  async addMarkdownContent(documentId, markdownContent) {
    try {
      console.log('[FeishuClient] Adding markdown content to document:', documentId);

      // Convert markdown to blocks
      const blocks = this._markdownToBlocks(markdownContent);

      console.log('[FeishuClient] Converted to', blocks.length, 'blocks');

      // Get document body block ID (first need to get document info)
      const docRes = await this.client.docx.document.get({
        path: { document_id: documentId }
      });

      if (docRes.code !== 0) {
        throw new Error(`Failed to get document: ${docRes.code} - ${docRes.msg}`);
      }

      const bodyBlockId = docRes.data.document.block_id;
      console.log('[FeishuClient] Document body block ID:', bodyBlockId);

      // Add blocks as children of body block
      const res = await this.client.docx.documentBlockChildren.create({
        path: {
          document_id: documentId,
          block_id: bodyBlockId
        },
        data: {
          children: blocks,
          index: 0
        }
      });

      if (res.code === 0) {
        console.log('[FeishuClient] Content added successfully');
      } else {
        throw new Error(`Failed to add content: ${res.code} - ${res.msg}`);
      }

    } catch (error) {
      console.error('[FeishuClient] Failed to add markdown content:', error.message);
      throw error;
    }
  }

  /**
   * Convert markdown text to Feishu blocks
   * @private
   * @param {string} markdown - Markdown content
   * @returns {Array} Array of block objects
   */
  _markdownToBlocks(markdown) {
    const blocks = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Skip empty lines
      if (!line.trim()) {
        i++;
        continue;
      }

      // Heading 1
      if (line.startsWith('# ')) {
        blocks.push({
          block_type: 3, // heading1
          heading1: {
            elements: [{ text_run: { content: line.substring(2) } }]
          }
        });
        i++;
      }
      // Heading 2
      else if (line.startsWith('## ')) {
        blocks.push({
          block_type: 4, // heading2
          heading2: {
            elements: [{ text_run: { content: line.substring(3) } }]
          }
        });
        i++;
      }
      // Heading 3
      else if (line.startsWith('### ')) {
        blocks.push({
          block_type: 5, // heading3
          heading3: {
            elements: [{ text_run: { content: line.substring(4) } }]
          }
        });
        i++;
      }
      // Unordered list
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          block_type: 12, // bullet
          bullet: {
            elements: [{ text_run: { content: line.substring(2) } }]
          }
        });
        i++;
      }
      // Ordered list
      else if (/^\d+\.\s/.test(line)) {
        const content = line.replace(/^\d+\.\s/, '');
        blocks.push({
          block_type: 13, // ordered
          ordered: {
            elements: [{ text_run: { content } }]
          }
        });
        i++;
      }
      // Code block
      else if (line.startsWith('```')) {
        const language = line.substring(3).trim() || 'plaintext';
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push({
          block_type: 14, // code
          code: {
            language,
            elements: [{ text_run: { content: codeLines.join('\n') } }]
          }
        });
        i++; // skip closing ```
      }
      // Regular text (with inline formatting)
      else {
        const elements = this._parseInlineMarkdown(line);
        blocks.push({
          block_type: 2, // text
          text: { elements }
        });
        i++;
      }
    }

    return blocks;
  }

  /**
   * Parse inline markdown formatting (bold, italic, code)
   * @private
   * @param {string} text - Text with inline markdown
   * @returns {Array} Array of text elements
   */
  _parseInlineMarkdown(text) {
    const elements = [];
    let current = '';
    let i = 0;

    while (i < text.length) {
      // Bold **text**
      if (text[i] === '*' && text[i + 1] === '*') {
        if (current) {
          elements.push({ text_run: { content: current } });
          current = '';
        }
        i += 2;
        let boldText = '';
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '*')) {
          boldText += text[i];
          i++;
        }
        elements.push({
          text_run: {
            content: boldText,
            text_element_style: { bold: true }
          }
        });
        i += 2;
      }
      // Italic *text*
      else if (text[i] === '*') {
        if (current) {
          elements.push({ text_run: { content: current } });
          current = '';
        }
        i++;
        let italicText = '';
        while (i < text.length && text[i] !== '*') {
          italicText += text[i];
          i++;
        }
        elements.push({
          text_run: {
            content: italicText,
            text_element_style: { italic: true }
          }
        });
        i++;
      }
      // Inline code `text`
      else if (text[i] === '`') {
        if (current) {
          elements.push({ text_run: { content: current } });
          current = '';
        }
        i++;
        let codeText = '';
        while (i < text.length && text[i] !== '`') {
          codeText += text[i];
          i++;
        }
        elements.push({
          text_run: {
            content: codeText,
            text_element_style: { inline_code: true }
          }
        });
        i++;
      }
      // Regular character
      else {
        current += text[i];
        i++;
      }
    }

    if (current) {
      elements.push({ text_run: { content: current } });
    }

    return elements.length > 0 ? elements : [{ text_run: { content: text } }];
  }

  /**
   * Create a document from markdown content (complete flow)
   * @param {string} title - Document title
   * @param {string} markdownContent - Markdown content
   * @param {string} folderToken - Parent folder token (optional)
   * @returns {Promise<{document_id: string, url: string, title: string}>}
   */
  async createDocumentFromMarkdown(title, markdownContent, folderToken = null) {
    try {
      console.log('[FeishuClient] Creating document from markdown:', title);

      // Step 1: Create document
      const doc = await this.createDocument(title, folderToken);

      // Step 2: Add markdown content
      await this.addMarkdownContent(doc.document_id, markdownContent);

      console.log('[FeishuClient] Document created from markdown successfully');

      return {
        document_id: doc.document_id,
        url: doc.url,
        title
      };

    } catch (error) {
      console.error('[FeishuClient] Failed to create document from markdown:', error.message);
      throw error;
    }
  }

  /**
   * Send document link to a chat
   * @param {string} chatId - Chat ID or Open ID
   * @param {string} documentId - Document ID
   * @param {string} title - Document title
   * @returns {Promise<{success: boolean, message_id: string}>}
   */
  async sendDocumentLink(chatId, documentId, title) {
    try {
      const url = `https://feishu.cn/docx/${documentId}`;
      const text = `📄 文档已创建：${title}\n🔗 ${url}`;

      return await this.sendTextMessage(chatId, text);

    } catch (error) {
      console.error('[FeishuClient] Failed to send document link:', error.message);
      throw error;
    }
  }

  /**
   * Set document to public access (anyone with link can view)
   * @param {string} documentId - Document ID
   * @param {Object} options - Permission options
   * @returns {Promise<Object>}
   */
  async setDocumentPublic(documentId, options = {}) {
    try {
      console.log('[FeishuClient] Setting document permissions:', documentId);

      const {
        type = 'docx',
        linkShareEntity = 'anyone_can_view',
        externalAccessEntity = 'open'
      } = options;

      // 尝试方案1：直接使用document_id作为token
      try {
        const res = await this.client.drive.permissionPublic.patch({
          path: {
            token: documentId,
            type: type
          },
          data: {
            external_access_entity: externalAccessEntity,
            link_share_entity: linkShareEntity,
            security_entity: linkShareEntity,
            comment_entity: linkShareEntity,
            share_entity: linkShareEntity
          }
        });

        if (res.code === 0) {
          console.log('[FeishuClient] Permission set successfully (method 1)');
          return { success: true, method: 'direct', data: res.data };
        } else {
          throw new Error(`API returned code ${res.code}: ${res.msg}`);
        }

      } catch (error) {
        console.log('[FeishuClient] Method 1 failed, trying method 2...');
        console.log('[FeishuClient] Error:', error.message);

        // 尝试方案2：只传token，通过query参数指定type
        const res2 = await this.client.drive.permissionPublic.patch({
          path: { token: documentId },
          params: { type: type },
          data: {
            external_access_entity: externalAccessEntity,
            link_share_entity: linkShareEntity,
            security_entity: linkShareEntity,
            comment_entity: linkShareEntity,
            share_entity: linkShareEntity
          }
        });

        if (res2.code === 0) {
          console.log('[FeishuClient] Permission set successfully (method 2)');
          return { success: true, method: 'query_param', data: res2.data };
        } else {
          throw new Error(`Both methods failed. Last error: ${res2.code} - ${res2.msg}`);
        }
      }

    } catch (error) {
      console.error('[FeishuClient] Failed to set document permissions:', error.message);

      // 提供更详细的错误信息
      if (error.code) {
        console.error('[FeishuClient] Error code:', error.code);
      }
      if (error.data) {
        console.error('[FeishuClient] Error data:', JSON.stringify(error.data, null, 2));
      }

      throw error;
    }
  }

  /**
   * Create a document from markdown content with optional permission setting
   * @param {string} title - Document title
   * @param {string} markdownContent - Markdown content
   * @param {Object} options - Creation options
   * @returns {Promise<{document_id: string, url: string, title: string}>}
   */
  async createDocumentFromMarkdownWithPermission(title, markdownContent, options = {}) {
    try {
      const {
        folderToken = null,
        setPermission = true,
        permissionType = 'public',
        linkShareEntity = 'anyone_can_view'
      } = options;

      console.log('[FeishuClient] Creating document from markdown with permission:', title);
      console.log('[FeishuClient] Set permission:', setPermission);

      // Step 1: 创建文档
      const doc = await this.createDocument(title, folderToken);

      // Step 2: 添加内容
      await this.addMarkdownContent(doc.document_id, markdownContent);

      // Step 3: 设置权限（如果需要）
      if (setPermission && permissionType === 'public') {
        try {
          await this.setDocumentPublic(doc.document_id, { linkShareEntity });
          console.log('[FeishuClient] Document permission set to public');
        } catch (permError) {
          console.error('[FeishuClient] Warning: Failed to set permission:', permError.message);
          console.error('[FeishuClient] Document created but may not be publicly accessible');
          // 不抛出错误，让文档创建成功
        }
      }

      console.log('[FeishuClient] Document created from markdown successfully');

      return {
        document_id: doc.document_id,
        url: doc.url,
        title
      };

    } catch (error) {
      console.error('[FeishuClient] Failed to create document from markdown with permission:', error.message);
      throw error;
    }
  }
}
