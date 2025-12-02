#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'http://localhost:33300/api';

// Test credentials
const ADMIN_USER = 'Jack';
const ADMIN_PASS = 'Linode1';

async function testMultiUserSystem() {
  console.log('🧪 Testing Multi-User System...\n');

  try {
    // 1. Test Admin Login
    console.log('1. Testing admin login...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: ADMIN_USER,
        password: ADMIN_PASS
      })
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ Admin login successful');
    console.log(`   User: ${loginData.user.username}`);
    console.log(`   Role: ${loginData.user.role || 'user'}\n`);

    // 2. Test Get All Users (Admin Only)
    console.log('2. Testing get all users (admin endpoint)...');
    const usersRes = await fetch(`${API_URL}/admin/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!usersRes.ok) {
      throw new Error(`Failed to fetch users: ${usersRes.status}`);
    }

    const usersData = await usersRes.json();
    console.log('✅ Successfully fetched users');
    console.log(`   Total users: ${usersData.users.length}`);
    usersData.users.forEach(u => {
      console.log(`   - ${u.username} (${u.role}) ${u.is_active ? '✓' : '✗'}`);
    });
    console.log();

    // 3. Test Get Stats (Admin Only)
    console.log('3. Testing get system stats...');
    const statsRes = await fetch(`${API_URL}/admin/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!statsRes.ok) {
      throw new Error(`Failed to fetch stats: ${statsRes.status}`);
    }

    const statsData = await statsRes.json();
    console.log('✅ Successfully fetched stats');
    console.log(`   Total users: ${statsData.stats.total_users}`);
    console.log(`   Active users: ${statsData.stats.active_users}`);
    console.log(`   Admin count: ${statsData.stats.admin_count}`);
    console.log(`   Recent logins: ${statsData.stats.recent_logins}`);
    console.log(`   Pending invitations: ${statsData.stats.pending_invitations}\n`);

    // 4. Test Create Invitation
    console.log('4. Testing create invitation...');
    const inviteRes = await fetch(`${API_URL}/admin/invitations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'user',
        expires_in_days: 7
      })
    });

    if (!inviteRes.ok) {
      throw new Error(`Failed to create invitation: ${inviteRes.status}`);
    }

    const inviteData = await inviteRes.json();
    console.log('✅ Successfully created invitation');
    console.log(`   Invite code: ${inviteData.invitation.invite_code}`);
    console.log(`   Role: ${inviteData.invitation.role}`);
    console.log(`   Expires: ${inviteData.invitation.expires_at}\n`);

    // 5. Test Non-Admin Access (should fail)
    console.log('5. Testing non-admin access control...');

    // First create a regular user
    const regularUserRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser_' + Date.now(),
        password: 'test123456',
        inviteCode: inviteData.invitation.invite_code
      })
    });

    if (regularUserRes.ok) {
      const regularUserData = await regularUserRes.json();
      const userToken = regularUserData.token;

      // Try to access admin endpoint with regular user token
      const adminTestRes = await fetch(`${API_URL}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });

      if (adminTestRes.status === 403) {
        console.log('✅ Access control working: Regular user denied admin access');
      } else {
        console.log('❌ Security issue: Regular user could access admin endpoint!');
      }
    } else {
      console.log('⚠️  Could not create test user');
    }

    console.log('\n🎉 Multi-user system test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testMultiUserSystem();