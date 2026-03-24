import React, { useState } from 'react';

interface Props {
  setAuthenticated: (pw: string) => void;
}

export default function LoginScreen({ setAuthenticated }: Props) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/verify-password', {
        headers: { 'x-app-password': pw }
      });
      if (res.ok) {
        setAuthenticated(pw);
      } else {
        setError('Invalid password. Please check your .env file on the server.');
      }
    } catch (err: any) {
      setError('Failed to connect to the backend server. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '400px', padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
          <img src="/vite.svg" alt="Logo" style={{ width: '32px', height: '32px' }} />
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>FlipSide Login</h2>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <input 
            type="password" 
            placeholder="Universal App Password" 
            value={pw} 
            onChange={e => setPw(e.target.value)} 
            className="input-base" 
            style={{ textAlign: 'center', letterSpacing: '0.1rem', fontSize: '1.1rem' }}
          />
          {error && <p style={{ color: '#ff6b6b', margin: 0, fontSize: '0.9rem' }}>{error}</p>}
          <button type="submit" className="button-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Authenticating...' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
