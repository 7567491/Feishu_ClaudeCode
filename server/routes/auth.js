import express from 'express';
import bcrypt from 'bcrypt';
import { userDb, db } from '../database/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Check auth status and setup requirements
router.get('/status', async (req, res) => {
  try {
    const hasUsers = await userDb.hasUsers();
    res.json({ 
      needsSetup: !hasUsers,
      isAuthenticated: false // Will be overridden by frontend if token exists
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration - multi-user support with role assignment
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, inviteCode } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Username must be at least 3 characters, password at least 6 characters' });
    }

    // Email validation (optional but recommended for multi-user system)
    if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Use a transaction to prevent race conditions
    db.prepare('BEGIN').run();
    try {
      // Check if this will be the first user (automatic admin)
      const hasUsers = userDb.hasUsers();
      let role = 'user';
      let requiresInvite = hasUsers; // Only require invite if users already exist

      if (!hasUsers) {
        // First user becomes admin automatically
        role = 'admin';
        requiresInvite = false;
      } else if (inviteCode) {
        // Validate invite code if provided
        const invite = db.prepare(`
          SELECT * FROM user_invitations
          WHERE invite_code = ?
          AND is_active = 1
          AND (expires_at IS NULL OR expires_at > datetime('now'))
          AND used_at IS NULL
        `).get(inviteCode);

        if (invite) {
          role = invite.role || 'user';
          // Mark invite as used
          db.prepare(`
            UPDATE user_invitations
            SET used_at = CURRENT_TIMESTAMP, used_by = ?
            WHERE id = ?
          `).run(null, invite.id); // Will update with actual user ID after creation
        } else {
          db.prepare('ROLLBACK').run();
          return res.status(403).json({ error: 'Invalid or expired invitation code' });
        }
      } else if (requiresInvite) {
        // Check if open registration is allowed (configurable)
        const openRegistration = process.env.ALLOW_OPEN_REGISTRATION === 'true';
        if (!openRegistration) {
          db.prepare('ROLLBACK').run();
          return res.status(403).json({ error: 'Registration requires an invitation code' });
        }
      }

      // Check if username already exists
      const existingUser = userDb.getUserByUsername(username);
      if (existingUser) {
        db.prepare('ROLLBACK').run();
        return res.status(409).json({ error: 'Username already exists' });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user with role
      const userStmt = db.prepare(`
        INSERT INTO users (username, password_hash, email, role, created_at, is_active)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
      `);
      const result = userStmt.run(username, passwordHash, email || null, role);
      const userId = result.lastInsertRowid;

      // Get the created user
      const user = userDb.getUserById(userId);

      // Generate token
      const token = generateToken(user);

      // Create session record for better tracking
      const tokenHash = await bcrypt.hash(token, 8);
      db.prepare(`
        INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(userId, tokenHash, req.ip, req.get('user-agent'));

      // Update last login
      userDb.updateLastLogin(user.id);

      // Update invite if used
      if (inviteCode) {
        db.prepare(`
          UPDATE user_invitations
          SET used_by = ?
          WHERE invite_code = ?
        `).run(userId, inviteCode);
      }

      db.prepare('COMMIT').run();

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        token
      });
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Get user from database
    const user = userDb.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Update last login
    userDb.updateLastLogin(user.id);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user'
      },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (protected route)
router.get('/user', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

// Logout (client-side token removal, but this endpoint can be used for logging)
router.post('/logout', authenticateToken, (req, res) => {
  // In a simple JWT system, logout is mainly client-side
  // This endpoint exists for consistency and potential future logging
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;