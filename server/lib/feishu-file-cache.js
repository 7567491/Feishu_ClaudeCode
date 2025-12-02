/**
 * Feishu File Cache Manager
 *
 * Manages file processing cache to prevent duplicate processing within 10 minutes
 * Tracks file modification times to detect changes
 */

import fs from 'fs';

export class FeishuFileCache {
  constructor() {
    // Cache storage: key = filePath, value = { lastProcessed, lastModified, chatId }
    this.cache = new Map();

    // Cache TTL: 10 minutes (600000 ms)
    this.cacheTTL = 10 * 60 * 1000;

    // Cleanup interval: run cleanup every 5 minutes
    this.cleanupInterval = 5 * 60 * 1000;

    // Start periodic cleanup
    this.startCleanup();

    console.log('[FileCache] Initialized with 10-minute TTL');
  }

  /**
   * Check if a file should be processed
   * @param {string} filePath - Full path to the file
   * @param {string} chatId - Chat ID (optional, for context-specific caching)
   * @returns {boolean} - true if file should be processed, false if should skip
   */
  shouldProcessFile(filePath, chatId = null) {
    try {
      // Get current file stats
      if (!fs.existsSync(filePath)) {
        console.log('[FileCache] File does not exist:', filePath);
        return true; // Process if file doesn't exist (will fail later)
      }

      const stats = fs.statSync(filePath);
      const currentModified = stats.mtimeMs;
      const now = Date.now();

      // Generate cache key (include chatId for chat-specific caching if provided)
      const cacheKey = chatId ? `${chatId}:${filePath}` : filePath;

      // Check cache
      const cached = this.cache.get(cacheKey);

      if (!cached) {
        // Not in cache, should process
        console.log('[FileCache] File not in cache, will process:', filePath);
        return true;
      }

      // Check if cache entry has expired
      if (now - cached.lastProcessed > this.cacheTTL) {
        // Cache expired, should process
        console.log('[FileCache] Cache expired for file:', filePath);
        this.cache.delete(cacheKey);
        return true;
      }

      // Check if file has been modified since last processing
      if (currentModified > cached.lastModified) {
        // File modified, should process
        console.log('[FileCache] File modified since last processing:', filePath);
        console.log(`[FileCache] Last modified: ${new Date(cached.lastModified)}, Current: ${new Date(currentModified)}`);
        return true;
      }

      // File is in cache, not expired, and not modified - skip processing
      const timeRemaining = Math.round((this.cacheTTL - (now - cached.lastProcessed)) / 1000);
      console.log(`[FileCache] Skipping file (cached for ${timeRemaining}s more):`, filePath);
      return false;

    } catch (error) {
      console.error('[FileCache] Error checking file:', error.message);
      // On error, allow processing
      return true;
    }
  }

  /**
   * Mark a file as processed
   * @param {string} filePath - Full path to the file
   * @param {string} chatId - Chat ID (optional)
   */
  markAsProcessed(filePath, chatId = null) {
    try {
      // Get file modification time
      if (!fs.existsSync(filePath)) {
        console.log('[FileCache] Cannot mark non-existent file as processed:', filePath);
        return;
      }

      const stats = fs.statSync(filePath);
      const modifiedTime = stats.mtimeMs;
      const now = Date.now();

      // Generate cache key
      const cacheKey = chatId ? `${chatId}:${filePath}` : filePath;

      // Store in cache
      this.cache.set(cacheKey, {
        lastProcessed: now,
        lastModified: modifiedTime,
        filePath: filePath,
        chatId: chatId
      });

      console.log('[FileCache] Marked as processed:', filePath);
      console.log(`[FileCache] Will skip duplicates for 10 minutes unless modified`);

    } catch (error) {
      console.error('[FileCache] Error marking file as processed:', error.message);
    }
  }

  /**
   * Clear cache for a specific file
   * @param {string} filePath - Full path to the file
   * @param {string} chatId - Chat ID (optional)
   */
  clearFileCache(filePath, chatId = null) {
    const cacheKey = chatId ? `${chatId}:${filePath}` : filePath;
    if (this.cache.delete(cacheKey)) {
      console.log('[FileCache] Cleared cache for:', filePath);
    }
  }

  /**
   * Clear all cache entries
   */
  clearAll() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[FileCache] Cleared all ${size} cache entries`);
  }

  /**
   * Start periodic cleanup of expired cache entries
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    console.log('[FileCache] Started periodic cleanup (every 5 minutes)');
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[FileCache] Stopped periodic cleanup');
    }
  }

  /**
   * Remove expired cache entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastProcessed > this.cacheTTL) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[FileCache] Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries = [];

    for (const [key, entry] of this.cache.entries()) {
      const timeRemaining = Math.max(0, this.cacheTTL - (now - entry.lastProcessed));
      entries.push({
        file: entry.filePath,
        chatId: entry.chatId,
        processedAt: new Date(entry.lastProcessed),
        modifiedAt: new Date(entry.lastModified),
        expiresIn: Math.round(timeRemaining / 1000) + 's'
      });
    }

    return {
      totalEntries: this.cache.size,
      cacheTTL: this.cacheTTL / 1000 + 's',
      entries: entries
    };
  }
}

// Create singleton instance
export const fileCache = new FeishuFileCache();