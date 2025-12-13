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

    // 无需@即可响应的群聊白名单（1-、2-、3-开头的群聊）
    // 这些群聊中，任何用户消息都会触发机器人响应
    this.noMentionRequiredChats = new Set([
      'oc_8623156bb41f217a3822aca12362b068',  // 1-市场活动 (/home/event)
      'oc_4a6d86d4fe64fba7300cd867611ad752',  // 2-案例库 (/home/case)
      'oc_3de30cbfdd18839ccc2b4566db8d8a24',  // 3-WebX (/home/webx)
      'oc_5d40b0cd98849b2c87ae950ec65e1de7',  // 会飞的CC (临时添加用于测试)
    ]);

    console.log('[FeishuClient] Initialized with App ID:', this.appId);
    console.log('[FeishuClient] No-mention-required chats:', this.noMentionRequiredChats.size);
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
      console.log('  Message Type:', event.message?.message_type);
      console.log('  Sender:', event.sender?.sender_id?.open_id);
      console.log('  Sender Type:', event.sender?.sender_type); // 新增：打印发送者类型
      console.log('  Sender ID Type:', event.sender?.sender_id?.id_type); // 新增：打印ID类型

      // 如果是机器人发送的消息，也打印出来（便于调试）
      if (event.sender?.sender_type === 'app') {
        console.log('  ⚠️  Message from BOT/APP detected');
        console.log('  Mentions:', JSON.stringify(event.message?.mentions, null, 2));
      }

      // Check if this message is for the bot
      if (!this.isMessageForBot(event)) {
        console.log('[FeishuClient] Message not for bot, skipping');
        return;
      }

      const msgType = event.message?.message_type;

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

      // Handle different message types
      if (msgType === 'file' || msgType === 'image' || msgType === 'media') {
        // File/image/media message - pass to handler with special payload
        console.log('[FeishuClient] File/Image/Media message detected');

        const filePayload = {
          type: msgType,
          fileKey: parsedContent.file_key || parsedContent.image_key || parsedContent.media_key,
          fileName: parsedContent.file_name || null
        };

        if (this.messageHandler) {
          await this.messageHandler(event, null, filePayload);
        }
        return;
      }

      // Text message handling (existing logic)
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
        await this.messageHandler(event, userText.trim(), null);
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
   * - Group chats in noMentionRequiredChats whitelist (无需@即可响应)
   * - Group chats where bot is mentioned (不区分发送者是用户还是机器人)
   */
  isMessageForBot(event) {
    const message = event.message;
    if (!message) {
      console.log('[FeishuClient] isMessageForBot: No message object, returning false');
      return false;
    }

    // Private chat - always for bot
    if (message.chat_type === 'p2p') {
      console.log('[FeishuClient] isMessageForBot: Private chat, returning true');
      return true;
    }

    // Group chat - check whitelist first, then mentions
    if (message.chat_type === 'group') {
      const chatId = message.chat_id;

      // 检查是否在无需@响应的白名单中
      if (this.noMentionRequiredChats.has(chatId)) {
        console.log('[FeishuClient] isMessageForBot: Chat in no-mention-required whitelist, returning true');
        console.log('[FeishuClient] Chat ID:', chatId);
        return true;
      }

      // 其他群聊需要@才能响应
      const mentions = message.mentions;
      console.log('[FeishuClient] isMessageForBot: Group chat, mentions:', mentions?.length || 0);

      if (!mentions || mentions.length === 0) {
        console.log('[FeishuClient] isMessageForBot: No mentions, returning false');
        return false;
      }

      // Check if bot is mentioned
      // If we have bot's open_id, check for exact match
      // Otherwise, accept any @ mention as potentially for us
      if (this.botInfo?.open_id) {
        console.log('[FeishuClient] isMessageForBot: Bot open_id exists, checking mentions...');
        for (const mention of mentions) {
          if (mention.id?.open_id === this.botInfo.open_id) {
            console.log('[FeishuClient] isMessageForBot: Bot is mentioned, returning true');
            return true;
          }
          if (mention.key === '@_all') {
            console.log('[FeishuClient] isMessageForBot: @_all detected, returning true');
            return true;
          }
        }
        console.log('[FeishuClient] isMessageForBot: Bot not mentioned, returning false');
        return false;
      } else {
        // No bot info - accept any mention (包括来自机器人的@消息)
        console.log('[FeishuClient] isMessageForBot: No bot open_id, accepting any mention, returning true');
        return true;
      }
    }

    // Unknown chat type
    console.log('[FeishuClient] isMessageForBot: Unknown chat type:', message.chat_type);
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

      // Check file size (100MB limit for safety)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (stats.size > maxSize) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max 100MB)`);
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

      // Get document blocks to find the page block (root block)
      const blocksRes = await this.client.docx.documentBlock.list({
        path: { document_id: documentId },
        params: { document_revision_id: -1, page_size: 500 }
      });

      if (blocksRes.code !== 0) {
        throw new Error(`Failed to get document blocks: ${blocksRes.code} - ${blocksRes.msg}`);
      }

      // The first block with parent_id='' is the page block (root)
      const pageBlock = blocksRes.data.items.find(item => item.parent_id === '');
      if (!pageBlock) {
        throw new Error('Failed to find page block in document');
      }

      const bodyBlockId = pageBlock.block_id;
      console.log('[FeishuClient] Document body block ID:', bodyBlockId);

      // Add blocks in batches to avoid API limits
      const batchSize = 50;  // Feishu might have limits on batch size
      let addedCount = 0;

      for (let i = 0; i < blocks.length; i += batchSize) {
        const batch = blocks.slice(i, Math.min(i + batchSize, blocks.length));

        console.log(`[FeishuClient] Adding batch ${Math.floor(i/batchSize) + 1}: ${batch.length} blocks...`);

        const res = await this.client.docx.documentBlockChildren.create({
          path: {
            document_id: documentId,
            block_id: bodyBlockId
          },
          data: {
            children: batch,
            index: -1  // -1 means append at end
          }
        });

        if (res.code === 0) {
          addedCount += batch.length;
          console.log(`[FeishuClient] Batch successful. Total added: ${addedCount}/${blocks.length}`);
        } else {
          throw new Error(`Failed to add content batch: ${res.code} - ${res.msg}`);
        }

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < blocks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log('[FeishuClient] All content added successfully');

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
   * Create a document from markdown content (complete flow with optional permission)
   * @param {string} title - Document title
   * @param {string} markdownContent - Markdown content
   * @param {Object|string} optionsOrFolderToken - Options object or folderToken (backward compatible)
   * @returns {Promise<{document_id: string, url: string, title: string}>}
   */
  async createDocumentFromMarkdown(title, markdownContent, optionsOrFolderToken = null) {
    try {
      // 兼容处理：如果传入的是字符串，视为folderToken（旧API）
      let options = {};
      if (typeof optionsOrFolderToken === 'string') {
        options.folderToken = optionsOrFolderToken;
        options.setPermission = false; // 保持向后兼容
      } else if (optionsOrFolderToken && typeof optionsOrFolderToken === 'object') {
        options = optionsOrFolderToken;
      }

      const {
        folderToken = null,
        setPermission = true,  // 默认设置权限！
        permissionType = 'public',
        // 默认改为“任何人可编辑”（需飞书后台权限支持）
        linkShareEntity = 'anyone_can_edit'
      } = options;

      console.log('[FeishuClient] Creating document from markdown:', title);
      console.log('[FeishuClient] Set permission:', setPermission);

      // Step 1: Create document
      const doc = await this.createDocument(title, folderToken);

      // Step 2: Add markdown content
      await this.addMarkdownContent(doc.document_id, markdownContent);

      // Step 3: Set permission (默认开启)
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
        // 默认允许任何人编辑（需后台权限配置）
        linkShareEntity = 'anyone_can_edit',
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
        linkShareEntity = 'anyone_can_edit'
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

  /**
   * Get all members in a chat/group
   * @param {string} chatId - Chat ID (e.g., oc_xxx)
   * @returns {Promise<Array>} Array of member objects with open_id, name, etc.
   */
  async getChatMembers(chatId) {
    try {
      console.log('[FeishuClient] Getting members for chat:', chatId);

      const members = [];
      let pageToken = null;
      let hasMore = true;

      // Paginate through all members
      while (hasMore) {
        const params = {
          member_id_type: 'open_id',
          page_size: 100
        };

        if (pageToken) {
          params.page_token = pageToken;
        }

        const res = await this.client.im.chatMembers.get({
          path: {
            chat_id: chatId
          },
          params
        });

        if (res.code === 0) {
          const items = res.data?.items || [];
          console.log(`[FeishuClient] Got ${items.length} members in this page`);

          // Extract member info
          for (const item of items) {
            // Determine member type based on available fields
            let memberType = 'user'; // Default to user

            // Check if it's a bot/app based on various indicators
            if (item.member_type) {
              // If API provides member_type, use it directly
              memberType = item.member_type;
              console.log(`[FeishuClient] Member ${item.name}: using API member_type = ${memberType}`);
            } else if (item.user_type) {
              // Some API versions use user_type
              memberType = item.user_type === 'app' ? 'app' : 'user';
              console.log(`[FeishuClient] Member ${item.name}: using user_type = ${memberType}`);
            } else if (item.is_bot || item.is_app) {
              // Check boolean flags if available
              memberType = 'app';
              console.log(`[FeishuClient] Member ${item.name}: detected as bot via flags`);
            } else if (item.name) {
              // Fallback: identify known bots by name
              const botNames = ['小六', 'AI初老师', 'Melody', 'AI助手', 'Claude'];
              if (botNames.some(bot => item.name.includes(bot))) {
                memberType = 'app';
                console.log(`[FeishuClient] Member ${item.name}: identified as bot by name`);
              } else {
                console.log(`[FeishuClient] Member ${item.name}: defaulting to user (no bot indicators)`);
              }
            }

            const member = {
              open_id: item.member_id,
              name: item.name || null,
              tenant_key: item.tenant_key || null,
              member_type: memberType
            };
            members.push(member);
          }

          hasMore = res.data?.has_more || false;
          pageToken = res.data?.page_token || null;

        } else {
          throw new Error(`Failed to get chat members: ${res.code} - ${res.msg}`);
        }
      }

      console.log(`[FeishuClient] Total members found: ${members.length}`);
      return members;

    } catch (error) {
      console.error('[FeishuClient] Failed to get chat members:', error.message);
      throw error;
    }
  }

  /**
   * Get user info by open_id
   * Note: This only works for users in the same tenant as the app
   * @param {string} openId - User's open_id
   * @returns {Promise<Object|null>} User info object or null if failed
   */
  async getUserInfo(openId) {
    try {
      console.log('[FeishuClient] Getting user info for:', openId);

      const res = await this.client.contact.user.get({
        path: {
          user_id: openId
        },
        params: {
          user_id_type: 'open_id'
        }
      });

      if (res.code === 0) {
        const user = res.data?.user;
        console.log('[FeishuClient] Got user info:', user?.name);
        return {
          open_id: openId,
          name: user?.name,
          nickname: user?.nickname,
          en_name: user?.en_name,
          tenant_key: user?.tenant_key
        };
      } else if (res.code === 99991663 || res.code === 99991400) {
        // User not found or no permission (cross-tenant user)
        console.log('[FeishuClient] User not accessible (possibly cross-tenant):', openId);
        return null;
      } else {
        throw new Error(`Failed to get user info: ${res.code} - ${res.msg}`);
      }

    } catch (error) {
      console.error('[FeishuClient] Failed to get user info:', error.message);
      return null;
    }
  }

  /**
   * Get chat info (name, description, owner, etc.)
   * @param {string} chatId - Chat ID (e.g., oc_xxx)
   * @returns {Promise<Object|null>} Chat info object or null if failed
   */
  async getChatInfo(chatId) {
    try {
      console.log('[FeishuClient] Getting chat info for:', chatId);

      const res = await this.client.im.chat.get({
        path: {
          chat_id: chatId
        }
      });

      if (res.code === 0) {
        const chat = res.data;
        console.log('[FeishuClient] Got chat info:', chat?.name);
        return {
          chat_id: chatId,
          name: chat?.name,
          description: chat?.description,
          owner_id: chat?.owner_id,
          chat_mode: chat?.chat_mode,
          chat_type: chat?.chat_type
        };
      } else {
        console.error('[FeishuClient] Failed to get chat info:', res.code, res.msg);
        return null;
      }

    } catch (error) {
      console.error('[FeishuClient] Error getting chat info:', error.message);
      return null;
    }
  }

  /**
   * Download file from Feishu by file_key
   * @param {string} fileKey - File key from message
   * @param {string} messageId - Message ID (for getting file info)
   * @returns {Promise<{buffer: Buffer, fileName: string, fileSize: number}>}
   */
  async downloadFile(fileKey, messageId) {
    try {
      console.log('[FeishuClient] Downloading file:', fileKey);

      // Get file info first
      const res = await this.client.im.file.get({
        path: {
          file_key: fileKey
        }
      });

      if (!res || !res.file) {
        throw new Error('Failed to download file: no file data returned');
      }

      // res.file is a Buffer
      const buffer = res.file;
      console.log('[FeishuClient] File downloaded, size:', buffer.length, 'bytes');

      // Try to get file name from message resource
      let fileName = 'unknown';
      try {
        const msgRes = await this.client.im.messageResource.get({
          path: {
            message_id: messageId,
            file_key: fileKey
          },
          params: {
            type: 'file'
          }
        });

        if (msgRes && msgRes.file_name) {
          fileName = msgRes.file_name;
        }
      } catch (nameError) {
        console.log('[FeishuClient] Could not get file name, using default');
      }

      return {
        buffer,
        fileName,
        fileSize: buffer.length
      };

    } catch (error) {
      console.error('[FeishuClient] Failed to download file:', error.message);
      throw error;
    }
  }

  /**
   * Download image from Feishu by image_key
   * @param {string} imageKey - Image key from message
   * @param {string} messageId - Message ID
   * @returns {Promise<{buffer: Buffer, fileName: string, fileSize: number}>}
   */
  async downloadImage(imageKey, messageId) {
    try {
      console.log('[FeishuClient] Downloading image:', imageKey);

      const res = await this.client.im.image.get({
        path: {
          image_key: imageKey
        }
      });

      if (!res || !res.image) {
        throw new Error('Failed to download image: no image data returned');
      }

      const buffer = res.image;
      console.log('[FeishuClient] Image downloaded, size:', buffer.length, 'bytes');

      // Generate filename with timestamp
      const timestamp = Date.now();
      const fileName = `image_${timestamp}.png`;

      return {
        buffer,
        fileName,
        fileSize: buffer.length
      };

    } catch (error) {
      console.error('[FeishuClient] Failed to download image:', error.message);
      throw error;
    }
  }

  /**
   * Upload file to Feishu Drive (云盘) - 支持大文件分片上传
   * @param {string} filePath - Path to the file to upload
   * @param {string} parentNode - Parent folder token (defaults to 'me' for user's root)
   * @param {string} parentType - Parent type: 'explorer' for folder token (default)
   * @returns {Promise<{file_token: string, url: string}>}
   */
  async uploadToDrive(filePath, parentNode = 'me', parentType = 'explorer') {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const fileSize = stats.size;

      console.log('[FeishuClient] 上传文件到云盘:', fileName, `(${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

      // 小文件直接上传，大文件（>10MB）使用分片上传
      const useChunkedUpload = fileSize > 10 * 1024 * 1024;

      if (useChunkedUpload) {
        console.log('[FeishuClient] 使用分片上传');
        return await this._uploadToDriveChunked(filePath, fileName, fileSize, parentNode, parentType);
      } else {
        console.log('[FeishuClient] 使用直接上传');
        return await this._uploadToDriveDirect(filePath, fileName, parentNode, parentType);
      }

    } catch (error) {
      console.error('[FeishuClient] 云盘上传失败:', error.message);
      throw error;
    }
  }

  /**
   * 直接上传小文件
   * @private
   */
  async _uploadToDriveDirect(filePath, fileName, parentNode, parentType) {
    const fileStream = fs.createReadStream(filePath);

    const uploadData = {
      file_name: fileName,
      file: fileStream,
      parent_type: parentType,
      parent_node: parentNode
    };

    const res = await this.client.drive.file.uploadAll({
      data: uploadData
    });

    if (res.code === 0) {
      const fileToken = res.data?.file_token;
      const url = `https://feishu.cn/drive/folder/${fileToken}`;

      console.log('[FeishuClient] 文件上传成功');
      console.log('  - File Token:', fileToken);
      console.log('  - URL:', url);

      return {
        file_token: fileToken,
        url: url,
        file_name: fileName
      };
    } else {
      throw new Error(`上传失败: ${res.code} - ${res.msg}`);
    }
  }

  /**
   * 分片上传大文件
   * @private
   */
  async _uploadToDriveChunked(filePath, fileName, fileSize, parentNode, parentType) {
    // Step 1: 预上传
    console.log('[FeishuClient] Step 1/3: 预上传...');
    const prepareData = {
      file_name: fileName,
      size: fileSize,
      parent_type: parentType,
      parent_node: parentNode
    };

    const prepareRes = await this.client.drive.file.uploadPrepare({
      data: prepareData
    });

    if (prepareRes.code !== 0) {
      throw new Error(`预上传失败: ${prepareRes.code} - ${prepareRes.msg}`);
    }

    const uploadId = prepareRes.data?.upload_id;
    const blockSize = prepareRes.data?.block_size || 4 * 1024 * 1024; // 默认 4MB
    const blockNum = prepareRes.data?.block_num || Math.ceil(fileSize / blockSize);

    console.log('[FeishuClient] 预上传成功');
    console.log('  - Upload ID:', uploadId);
    console.log('  - Block Size:', (blockSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('  - Total Blocks:', blockNum);

    // Step 2: 分片上传
    console.log('[FeishuClient] Step 2/3: 分片上传...');

    for (let seq = 0; seq < blockNum; seq++) {
      const start = seq * blockSize;
      const end = Math.min(start + blockSize, fileSize);
      const chunkSize = end - start;

      console.log(`[FeishuClient] 上传分片 ${seq + 1}/${blockNum} (${(chunkSize / 1024 / 1024).toFixed(2)}MB)...`);

      // 读取文件分片
      const buffer = Buffer.alloc(chunkSize);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, chunkSize, start);
      fs.closeSync(fd);

      const partRes = await this.client.drive.file.uploadPart({
        data: {
          upload_id: uploadId,
          seq: seq,
          size: chunkSize,
          file: buffer
        }
      });

      if (partRes.code !== 0) {
        throw new Error(`分片上传失败 (${seq + 1}/${blockNum}): ${partRes.code} - ${partRes.msg}`);
      }
    }

    console.log('[FeishuClient] 所有分片上传完成');

    // Step 3: 完成上传
    console.log('[FeishuClient] Step 3/3: 完成上传...');
    const finishRes = await this.client.drive.file.uploadFinish({
      data: {
        upload_id: uploadId,
        block_num: blockNum
      }
    });

    if (finishRes.code !== 0) {
      throw new Error(`完成上传失败: ${finishRes.code} - ${finishRes.msg}`);
    }

    const fileToken = finishRes.data?.file_token;
    const url = `https://feishu.cn/drive/folder/${fileToken}`;

    console.log('[FeishuClient] 文件上传成功');
    console.log('  - File Token:', fileToken);
    console.log('  - URL:', url);

    return {
      file_token: fileToken,
      url: url,
      file_name: fileName
    };
  }

  /**
   * Upload file to Drive and send link to chat
   * @param {string} chatId - Chat ID
   * @param {string} filePath - Path to file
   * @param {string} parentNode - Parent folder token (optional)
   * @returns {Promise<{file_token: string, url: string, message_id: string}>}
   */
  async uploadAndShareToDrive(chatId, filePath, parentNode = null) {
    try {
      // Upload to Drive
      const result = await this.uploadToDrive(filePath, parentNode);

      // Send link to chat
      const text = `📁 文件已上传到云盘：${result.file_name}\n🔗 ${result.url}\n\n💡 可用于飞书妙记转写`;
      const msgResult = await this.sendTextMessage(chatId, text);

      return {
        ...result,
        message_id: msgResult.message_id
      };

    } catch (error) {
      console.error('[FeishuClient] 上传并分享失败:', error.message);
      throw error;
    }
  }
}
