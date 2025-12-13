/**
 * Feishu REST API Routes
 *
 * Provides HTTP endpoints for Feishu session management.
 * Note: The Feishu service now runs via HTTP Webhook (not WebSocket).
 * All endpoints require authentication.
 */

import express from 'express';
import { feishuDb } from '../database/db.js';

const router = express.Router();

/**
 * GET /api/feishu/status
 * Get service status
 */
router.get('/status', async (req, res) => {
  try {
    // Webhook mode is always running as part of main service
    res.json({
      success: true,
      isRunning: true,
      mode: 'webhook',
      message: 'Feishu service runs via HTTP Webhook (integrated with main service)'
    });
  } catch (error) {
    console.error('[Feishu API] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/feishu/start
 * Start the Feishu service (no-op in webhook mode)
 */
router.post('/start', async (req, res) => {
  res.json({
    success: true,
    message: 'Feishu service runs via HTTP Webhook - always active when main service is running'
  });
});

/**
 * POST /api/feishu/stop
 * Stop the Feishu service (no-op in webhook mode)
 */
router.post('/stop', async (req, res) => {
  res.json({
    success: true,
    message: 'Feishu service runs via HTTP Webhook - cannot be stopped separately'
  });
});

/**
 * GET /api/feishu/sessions
 * Get all active Feishu sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.user?.id; // From auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const sessions = feishuDb.getAllSessions(userId);

    res.json({
      success: true,
      data: {
        sessions,
        total: sessions.length
      }
    });

  } catch (error) {
    console.error('[Feishu API] Error getting sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/feishu/sessions/:id
 * Deactivate a Feishu session
 */
router.delete('/sessions/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
    }

    feishuDb.deactivateSession(sessionId);

    res.json({
      success: true,
      message: 'Session deactivated successfully'
    });

  } catch (error) {
    console.error('[Feishu API] Error deactivating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/feishu/sessions/:id/messages
 * Get message history for a session
 */
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 100;

    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
    }

    const messages = feishuDb.getMessageHistory(sessionId, limit);

    res.json({
      success: true,
      data: {
        messages,
        total: messages.length
      }
    });

  } catch (error) {
    console.error('[Feishu API] Error getting messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/feishu/stats
 * Get Feishu usage statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.id; // From auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const stats = feishuDb.getStats(userId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('[Feishu API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/feishu/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'feishu',
    mode: 'webhook',
    timestamp: new Date().toISOString(),
    status: 'running'
  });
});

/**
 * GET /api/feishu/config
 * Get Feishu configuration status (without exposing secrets)
 */
router.get('/config', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Check if credentials exist
    const hasEnvVars = !!(process.env.FeishuCC_App_ID && process.env.FeishuCC_App_Secret);

    // Note: We don't expose actual credential values
    res.json({
      success: true,
      data: {
        hasEnvironmentVariables: hasEnvVars,
        configurationSource: hasEnvVars ? 'environment' : 'not_configured'
      }
    });

  } catch (error) {
    console.error('[Feishu API] Error getting config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
