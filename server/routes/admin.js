import express from 'express';
import bcrypt from 'bcrypt';
import { userDb, db } from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get all users (admin only)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = userDb.getAllUsers();

    // Remove sensitive data
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login
    }));

    res.json({ users: sanitizedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin only)
router.get('/users/:userId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = userDb.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password hash
    delete user.password_hash;

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user role (admin only)
router.patch('/users/:userId/role', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { role } = req.body;

    // Validate role
    if (!['admin', 'user', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent self-demotion for last admin
    if (userId === req.user.id && role !== 'admin') {
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1').get('admin').count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove last admin' });
      }
    }

    userDb.updateUserRole(userId, role);
    res.json({ success: true, message: 'User role updated' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Toggle user active status (admin only)
router.patch('/users/:userId/status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { is_active } = req.body;

    // Prevent self-deactivation
    if (userId === req.user.id && !is_active) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    if (is_active) {
      userDb.reactivateUser(userId);
    } else {
      userDb.deactivateUser(userId);
    }

    res.json({ success: true, message: 'User status updated' });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Create user invitation (admin only)
router.post('/invitations', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { email, role = 'user', expires_in_days = 7 } = req.body;

    // Generate invite code
    const inviteCode = crypto.randomBytes(16).toString('hex');

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    const stmt = db.prepare(`
      INSERT INTO user_invitations (invite_code, email, role, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(inviteCode, email || null, role, req.user.id, expiresAt.toISOString());

    res.json({
      success: true,
      invitation: {
        id: result.lastInsertRowid,
        invite_code: inviteCode,
        email,
        role,
        expires_at: expiresAt
      }
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// Get all invitations (admin only)
router.get('/invitations', authenticateToken, requireAdmin, (req, res) => {
  try {
    const invitations = db.prepare(`
      SELECT i.*, u.username as created_by_username, u2.username as used_by_username
      FROM user_invitations i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN users u2 ON i.used_by = u2.id
      ORDER BY i.created_at DESC
    `).all();

    res.json({ invitations });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Revoke invitation (admin only)
router.delete('/invitations/:invitationId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const invitationId = parseInt(req.params.invitationId);

    const result = db.prepare('UPDATE user_invitations SET is_active = 0 WHERE id = ?').run(invitationId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    res.json({ success: true, message: 'Invitation revoked' });
  } catch (error) {
    console.error('Error revoking invitation:', error);
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

// Reset user password (admin only)
router.post('/users/:userId/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get system statistics (admin only)
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stats = {
      total_users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      active_users: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count,
      admin_count: db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1').get('admin').count,
      recent_logins: db.prepare(`
        SELECT COUNT(*) as count FROM users
        WHERE last_login > datetime('now', '-7 days')
      `).get().count,
      pending_invitations: db.prepare(`
        SELECT COUNT(*) as count FROM user_invitations
        WHERE is_active = 1 AND used_at IS NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).get().count
    };

    res.json({ stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;