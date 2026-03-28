import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronUp, Building2, Users } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

interface User {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

interface AdminPanelProps {
  appPassword: string;
}

function authHeaders(token: string) {
  return { 'Authorization': `Bearer ${token}` };
}
function jsonHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// ─── Inline editable row ──────────────────────────────────────────────────────

function CompanyRow({ company, token, onRefresh }: { company: Company; token: string; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [active, setActive] = useState(company.active);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/admin/companies/${company.id}`, {
      method: 'PUT', headers: jsonHeaders(token),
      body: JSON.stringify({ name, active }),
    });
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  const del = async () => {
    if (!confirm(`Delete company "${company.name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/companies/${company.id}`, { method: 'DELETE', headers: authHeaders(token) });
    onRefresh();
  };

  return (
    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
      <td style={{ padding: '10px 12px' }}>
        {editing ? <input className="input-base" value={name} onChange={e => setName(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem', maxWidth: '200px' }} /> : <span style={{ fontSize: '0.9rem' }}>{company.name}</span>}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {editing ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Active
          </label>
        ) : (
          <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '12px', background: company.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: company.active ? '#22c55e' : '#ef4444' }}>
            {company.active ? 'Active' : 'Inactive'}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {new Date(company.createdAt).toLocaleDateString()}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {editing ? (
            <>
              <button className="btn-icon" onClick={save} disabled={saving} style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={13} /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn-icon" onClick={() => { setEditing(false); setName(company.name); setActive(company.active); }} style={{ padding: '3px 10px', fontSize: '0.78rem' }}>
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button className="btn-icon" onClick={() => setEditing(true)} style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pencil size={13} /> Edit
              </button>
              <button className="btn-icon" onClick={del} style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function UserRow({ user, companies, token, onRefresh }: { user: User; companies: Company[]; token: string; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  const [newPassword, setNewPassword] = useState('');
  const [companyId, setCompanyId] = useState(user.companyId);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const updates: Record<string, any> = { name, role, active, companyId };
    if (newPassword) updates.password = newPassword;
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PUT', headers: jsonHeaders(token),
      body: JSON.stringify(updates),
    });
    setSaving(false);
    setEditing(false);
    setNewPassword('');
    onRefresh();
  };

  const del = async () => {
    if (!confirm(`Delete user "${user.email}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: authHeaders(token) });
    onRefresh();
  };

  const companyName = companies.find(c => c.id === user.companyId)?.name || user.companyId;

  return (
    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
      <td style={{ padding: '10px 12px', fontSize: '0.85rem' }}>
        {editing ? <input className="input-base" value={name} onChange={e => setName(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem', maxWidth: '160px' }} /> : user.name}
      </td>
      <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{user.email}</td>
      <td style={{ padding: '10px 12px', fontSize: '0.85rem' }}>
        {editing ? (
          <select className="input-base" value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.82rem' }}>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : companyName}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {editing ? (
          <select className="input-base" value={role} onChange={e => setRole(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.82rem', maxWidth: '120px' }}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
        ) : (
          <span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: '12px', background: user.role === 'superadmin' ? 'rgba(168,85,247,0.15)' : user.role === 'admin' ? 'rgba(99,102,241,0.15)' : 'rgba(107,114,128,0.12)', color: user.role === 'superadmin' ? '#a855f7' : user.role === 'admin' ? '#6366f1' : 'var(--text-secondary)' }}>
            {user.role}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {editing ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Active
          </label>
        ) : (
          <span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: '12px', background: user.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: user.active ? '#22c55e' : '#ef4444' }}>
            {user.active ? 'Active' : 'Inactive'}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {editing && (
          <input className="input-base" type="password" placeholder="New password (optional)" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.82rem', maxWidth: '160px' }} />
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {editing ? (
            <>
              <button className="btn-icon" onClick={save} disabled={saving} style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={13} /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn-icon" onClick={() => { setEditing(false); setName(user.name); setRole(user.role); setActive(user.active); setNewPassword(''); setCompanyId(user.companyId); }} style={{ padding: '3px 10px', fontSize: '0.78rem' }}>
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button className="btn-icon" onClick={() => setEditing(true)} style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pencil size={13} /> Edit
              </button>
              <button className="btn-icon" onClick={del} style={{ padding: '3px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────

export default function AdminPanel({ appPassword }: AdminPanelProps) {
  const [activeSection, setActiveSection] = useState<'companies' | 'users'>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // New company form
  const [newCompanyName, setNewCompanyName] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);

  // New user form
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', companyId: '', role: 'user' });
  const [addingUser, setAddingUser] = useState(false);
  const [newUserError, setNewUserError] = useState('');

  const fetchCompanies = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/companies', { headers: authHeaders(appPassword) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setCompanies(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders(appPassword) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setUsers(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchUsers();
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    setAddingCompany(true);
    await fetch('/api/admin/companies', {
      method: 'POST', headers: jsonHeaders(appPassword),
      body: JSON.stringify({ name: newCompanyName.trim() }),
    });
    setNewCompanyName('');
    setAddingCompany(false);
    fetchCompanies();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserError('');
    if (!newUser.name || !newUser.email || !newUser.password || !newUser.companyId) {
      setNewUserError('All fields are required.');
      return;
    }
    setAddingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: jsonHeaders(appPassword),
        body: JSON.stringify(newUser),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setNewUser({ name: '', email: '', password: '', companyId: companies[0]?.id || '', role: 'user' });
      setShowNewUser(false);
      fetchUsers();
    } catch (e: any) {
      setNewUserError(e.message);
    } finally {
      setAddingUser(false);
    }
  };

  const sectionBtn = (s: 'companies' | 'users', Icon: any, label: string) => (
    <button onClick={() => setActiveSection(s)} style={{ padding: '10px 20px', background: activeSection === s ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: activeSection === s ? 'var(--glass-border)' : 'transparent', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: activeSection === s ? 600 : 400, fontSize: '0.9rem' }}>
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 4px 0', fontSize: '1.3rem' }}>Admin Panel</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manage companies and user accounts.</p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {sectionBtn('companies', Building2, `Companies (${companies.length})`)}
        {sectionBtn('users', Users, `Users (${users.length})`)}
      </div>

      {error && <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</p>}

      {/* ── Companies ── */}
      {activeSection === 'companies' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Companies</h3>
          </div>

          {/* Add company form */}
          <form onSubmit={handleAddCompany} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
            <input className="input-base" placeholder="New company name…" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} style={{ maxWidth: '280px' }} />
            <button type="submit" className="btn-primary" disabled={addingCompany || !newCompanyName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}>
              <Plus size={14} /> {addingCompany ? 'Adding…' : 'Add Company'}
            </button>
          </form>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</p>
          ) : companies.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No companies yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Name', 'Status', 'Created', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => <CompanyRow key={c.id} company={c} token={appPassword} onRefresh={fetchCompanies} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Users ── */}
      {activeSection === 'users' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Users</h3>
            <button className="btn-primary" onClick={() => { setShowNewUser(v => !v); setNewUser(u => ({ ...u, companyId: companies[0]?.id || '' })); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}>
              {showNewUser ? <><ChevronUp size={14} /> Cancel</> : <><Plus size={14} /> Add User</>}
            </button>
          </div>

          {/* Add user form */}
          {showNewUser && (
            <form onSubmit={handleAddUser} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Name</label>
                <input className="input-base" placeholder="Full name" value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Email</label>
                <input className="input-base" type="email" placeholder="user@example.com" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Password</label>
                <input className="input-base" type="password" placeholder="Initial password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Company</label>
                <select className="input-base" value={newUser.companyId} onChange={e => setNewUser(u => ({ ...u, companyId: e.target.value }))}>
                  <option value="">— select —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Role</label>
                <select className="input-base" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={addingUser} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}>
                  <Check size={14} /> {addingUser ? 'Creating…' : 'Create User'}
                </button>
              </div>
              {newUserError && <p style={{ gridColumn: '1 / -1', color: '#ef4444', margin: 0, fontSize: '0.82rem' }}>{newUserError}</p>}
            </form>
          )}

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</p>
          ) : users.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No users yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Name', 'Email', 'Company', 'Role', 'Status', 'Reset Password', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => <UserRow key={u.id} user={u} companies={companies} token={appPassword} onRefresh={fetchUsers} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
