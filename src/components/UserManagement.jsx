import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Users, Shield, UserPlus, Trash2, Edit2, Mail, Key, MoreVertical } from 'lucide-react';

const UserManagement = () => {
  const { token, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('users');

  // Invitation form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteExpiry, setInviteExpiry] = useState(7);

  // Password reset state
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch users
      const usersRes = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!usersRes.ok) throw new Error('Failed to fetch users');
      const usersData = await usersRes.json();
      setUsers(usersData.users);

      // Fetch invitations
      const invitesRes = await fetch('/api/admin/invitations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvitations(invitesData.invitations);
      }

      // Fetch stats
      const statsRes = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId, newRole) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }

      // Refresh data
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleUserStatus = async (userId, isActive) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: isActive })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }

      // Refresh data
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const createInvitation = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: inviteEmail || null,
          role: inviteRole,
          expires_in_days: inviteExpiry
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create invitation');
      }

      const data = await res.json();
      alert(`Invitation created! Code: ${data.invitation.invite_code}`);

      // Reset form
      setInviteEmail('');
      setInviteRole('user');
      setInviteExpiry(7);
      setShowInviteModal(false);

      // Refresh data
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const revokeInvitation = async (invitationId) => {
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke invitation');
      }

      // Refresh data
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const resetUserPassword = async (e) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_password: newPassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset password');
      }

      alert('Password reset successfully!');
      setNewPassword('');
      setSelectedUser(null);
      setShowPasswordResetModal(false);
    } catch (err) {
      alert(err.message);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h2 className="text-xl font-semibold">Admin Access Required</h2>
        <p className="text-gray-500 mt-2">You need administrator privileges to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-500">Loading user management...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with Stats */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-7 h-7" />
              User Management
            </h1>
            <p className="text-muted-foreground mt-1">Manage users, roles, and invitations</p>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite User
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-background border border-border rounded-lg p-4">
              <div className="text-2xl font-bold">{stats.total_users}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </div>
            <div className="bg-background border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{stats.active_users}</div>
              <div className="text-sm text-muted-foreground">Active Users</div>
            </div>
            <div className="bg-background border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.admin_count}</div>
              <div className="text-sm text-muted-foreground">Administrators</div>
            </div>
            <div className="bg-background border border-border rounded-lg p-4">
              <div className="text-2xl font-bold">{stats.recent_logins}</div>
              <div className="text-sm text-muted-foreground">Recent Logins</div>
            </div>
            <div className="bg-background border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-600">{stats.pending_invitations}</div>
              <div className="text-sm text-muted-foreground">Pending Invites</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'invitations'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Invitations ({invitations.filter(i => i.is_active && !i.used_at).length})
          </button>
        </div>
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left p-4">User</th>
                <th className="text-left p-4">Role</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Created</th>
                <th className="text-left p-4">Last Login</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border hover:bg-muted/10">
                  <td className="p-4">
                    <div>
                      <div className="font-medium">{u.username}</div>
                      {u.email && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {u.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <select
                      value={u.role}
                      onChange={(e) => updateUserRole(u.id, e.target.value)}
                      className="px-2 py-1 border border-border rounded bg-background"
                      disabled={u.id === user.id}
                    >
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      u.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(u);
                          setShowPasswordResetModal(true);
                        }}
                        className="p-1 hover:bg-muted rounded"
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleUserStatus(u.id, !u.is_active)}
                        className="p-1 hover:bg-muted rounded"
                        disabled={u.id === user.id}
                        title={u.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {u.is_active ? (
                          <Trash2 className="w-4 h-4 text-red-500" />
                        ) : (
                          <Edit2 className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invitations Table */}
      {activeTab === 'invitations' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left p-4">Code</th>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Role</th>
                <th className="text-left p-4">Created By</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Expires</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id} className="border-b border-border hover:bg-muted/10">
                  <td className="p-4">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {inv.invite_code}
                    </code>
                  </td>
                  <td className="p-4 text-sm">
                    {inv.email || <span className="text-muted-foreground">Any</span>}
                  </td>
                  <td className="p-4 text-sm">{inv.role}</td>
                  <td className="p-4 text-sm">{inv.created_by_username}</td>
                  <td className="p-4">
                    {inv.used_at ? (
                      <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 px-2 py-1 rounded">
                        Used by {inv.used_by_username}
                      </span>
                    ) : inv.is_active ? (
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-1 rounded">
                        Pending
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400 px-2 py-1 rounded">
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="p-4">
                    {inv.is_active && !inv.used_at && (
                      <button
                        onClick={() => revokeInvitation(inv.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create Invitation</h2>
            <form onSubmit={createInvitation} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  placeholder="user@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to create an open invitation
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                >
                  <option value="user">User</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Expires in (days)
                </label>
                <input
                  type="number"
                  value={inviteExpiry}
                  onChange={(e) => setInviteExpiry(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  min="1"
                  max="365"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Create Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordResetModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">
              Reset Password for {selectedUser.username}
            </h2>
            <form onSubmit={resetUserPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                  placeholder="Enter new password"
                  minLength="6"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum 6 characters
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordResetModal(false);
                    setSelectedUser(null);
                    setNewPassword('');
                  }}
                  className="px-4 py-2 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;