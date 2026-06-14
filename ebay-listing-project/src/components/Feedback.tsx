import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PlusCircle, X, Trash2, Image as ImageIcon, MessageSquare,
  Send, Shield, Upload,
} from 'lucide-react';
import type { FeedbackPost, FeedbackReply, FeedbackStatus } from '../types';
import { useToast } from '../context/ToastContext';
import Lightbox from './Lightbox';

interface Props {
  appPassword: string;
  currentUserId: string;
  isSuperAdmin: boolean;
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  not_started: 'Not Started',
  under_review: 'Under Review',
  pending: 'Pending',
  implemented: 'Implemented',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<FeedbackStatus, { bg: string; fg: string; border: string }> = {
  not_started: { bg: 'rgba(148,163,184,0.15)', fg: '#cbd5e1', border: 'rgba(148,163,184,0.4)' },
  under_review: { bg: 'rgba(59,130,246,0.15)', fg: '#93c5fd', border: 'rgba(59,130,246,0.4)' },
  pending:      { bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d', border: 'rgba(245,158,11,0.4)' },
  implemented:  { bg: 'rgba(34,197,94,0.15)',  fg: '#86efac', border: 'rgba(34,197,94,0.4)' },
  cancelled:    { bg: 'rgba(239,68,68,0.15)',  fg: '#fca5a5', border: 'rgba(239,68,68,0.4)' },
};

const STATUS_ORDER: FeedbackStatus[] = ['not_started', 'under_review', 'pending', 'implemented', 'cancelled'];
const COMPLETED_STATUSES: FeedbackStatus[] = ['implemented', 'cancelled'];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: '999px',
      fontSize: '0.72rem', fontWeight: 600,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>{STATUS_LABELS[status]}</span>
  );
}

export default function Feedback({ appPassword, currentUserId, isSuperAdmin }: Props) {
  const { toast } = useToast();
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` }), [appPassword]);
  const bearer = useMemo(() => ({ 'Authorization': `Bearer ${appPassword}` }), [appPassword]);

  const loadPosts = async () => {
    try {
      const resp = await fetch('/api/feedback', { headers: bearer });
      const data = await resp.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast('Failed to load feedback: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPosts(); }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      if (!showCompleted && COMPLETED_STATUSES.includes(p.status)) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
  }, [posts, showCompleted, statusFilter]);

  const selected = selectedId ? posts.find(p => p.id === selectedId) || null : null;

  const handleCreate = async (title: string, message: string, images: string[]) => {
    const resp = await fetch('/api/feedback', {
      method: 'POST', headers, body: JSON.stringify({ title, message, images }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      toast('Failed to create post: ' + (err.error || resp.statusText), 'error');
      return false;
    }
    const { post } = await resp.json();
    setPosts(prev => [post, ...prev]);
    setComposerOpen(false);
    setSelectedId(post.id);
    toast('Post created.', 'success');
    return true;
  };

  const handleStatusChange = async (id: string, status: FeedbackStatus) => {
    const prev = posts;
    setPosts(p => p.map(x => x.id === id ? { ...x, status, updatedAt: Date.now() } : x));
    const resp = await fetch(`/api/feedback/${id}`, {
      method: 'PUT', headers, body: JSON.stringify({ updates: { status } }),
    });
    if (!resp.ok) {
      setPosts(prev);
      toast('Failed to change status', 'error');
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Delete this post and all replies?')) return;
    const resp = await fetch(`/api/feedback/${id}`, { method: 'DELETE', headers: bearer });
    if (!resp.ok) { toast('Failed to delete', 'error'); return; }
    setPosts(p => p.filter(x => x.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast('Post deleted.', 'info');
  };

  const handleAddReply = async (id: string, message: string): Promise<boolean> => {
    const resp = await fetch(`/api/feedback/${id}/replies`, {
      method: 'POST', headers, body: JSON.stringify({ message }),
    });
    if (!resp.ok) { toast('Failed to send reply', 'error'); return false; }
    const { reply } = await resp.json() as { reply: FeedbackReply };
    setPosts(p => p.map(x => x.id === id
      ? { ...x, replies: [...(x.replies || []), reply], updatedAt: Date.now() }
      : x));
    return true;
  };

  const handleDeleteReply = async (postId: string, replyId: string) => {
    const resp = await fetch(`/api/feedback/${postId}/replies/${replyId}`, { method: 'DELETE', headers: bearer });
    if (!resp.ok) { toast('Failed to delete reply', 'error'); return; }
    setPosts(p => p.map(x => x.id === postId
      ? { ...x, replies: (x.replies || []).filter(r => r.id !== replyId) }
      : x));
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Feedback Forum</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Report issues, request features, and track their progress.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setComposerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PlusCircle size={16} /> New Post
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Status:
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.85rem' }}
          >
            <option value="all">All</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
          Show completed (Implemented & Cancelled)
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {filteredPosts.length} of {posts.length} posts
        </span>
      </div>

      {/* Master / detail layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(280px, 360px) 1fr' : '1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Post list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading…</div>
          ) : filteredPosts.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              {posts.length === 0 ? 'No posts yet. Be the first to post feedback!' : 'No posts match the current filter.'}
            </div>
          ) : (
            filteredPosts.map(p => (
              <PostListItem
                key={p.id}
                post={p}
                selected={p.id === selectedId}
                onClick={() => setSelectedId(p.id)}
              />
            ))
          )}
        </div>

        {/* Post detail */}
        {selected && (
          <PostDetail
            key={selected.id}
            post={selected}
            currentUserId={currentUserId}
            isSuperAdmin={isSuperAdmin}
            onStatusChange={s => handleStatusChange(selected.id, s)}
            onDeletePost={() => handleDeletePost(selected.id)}
            onAddReply={msg => handleAddReply(selected.id, msg)}
            onDeleteReply={rid => handleDeleteReply(selected.id, rid)}
            onClose={() => setSelectedId(null)}
            onOpenLightbox={(images, idx) => setLightbox({ images, index: idx })}
          />
        )}
      </div>

      {composerOpen && (
        <ComposerModal
          appPassword={appPassword}
          onClose={() => setComposerOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={i => setLightbox(lb => lb ? { ...lb, index: i } : lb)}
        />
      )}
    </div>
  );
}

// ─── List item ──────────────────────────────────────────────────────────────

function PostListItem({ post, selected, onClick }: { post: FeedbackPost; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-panel"
      style={{
        textAlign: 'left',
        padding: '0.85rem 1rem',
        background: selected ? 'rgba(99,102,241,0.12)' : 'var(--glass-bg)',
        border: `1px solid ${selected ? 'rgba(99,102,241,0.5)' : 'var(--border-color)'}`,
        borderRadius: '10px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
        color: 'var(--text-primary)',
        transition: 'background 0.15s, border 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.3, flex: 1 }}>{post.title}</span>
        <StatusBadge status={post.status} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>{post.authorName}</span>
        <span>·</span>
        <span>{timeAgo(post.createdAt)}</span>
        {post.replies?.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <MessageSquare size={12} /> {post.replies.length}
          </span>
        )}
        {post.images?.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <ImageIcon size={12} /> {post.images.length}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Post detail panel ──────────────────────────────────────────────────────

function PostDetail({
  post, currentUserId, isSuperAdmin,
  onStatusChange, onDeletePost, onAddReply, onDeleteReply,
  onClose, onOpenLightbox,
}: {
  post: FeedbackPost;
  currentUserId: string;
  isSuperAdmin: boolean;
  onStatusChange: (s: FeedbackStatus) => void;
  onDeletePost: () => void;
  onAddReply: (msg: string) => Promise<boolean>;
  onDeleteReply: (replyId: string) => void;
  onClose: () => void;
  onOpenLightbox: (images: string[], index: number) => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const canDeletePost = isSuperAdmin || post.authorId === currentUserId;

  const submitReply = async () => {
    const msg = replyText.trim();
    if (!msg) return;
    setSending(true);
    const ok = await onAddReply(msg);
    setSending(false);
    if (ok) setReplyText('');
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', lineHeight: 1.3 }}>{post.title}</h3>
          <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Posted by <strong style={{ color: 'var(--text-primary)' }}>{post.authorName}</strong> · {timeAgo(post.createdAt)}
          </div>
        </div>
        <button onClick={onClose} title="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
          <X size={18} />
        </button>
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {isSuperAdmin ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Status:
            <select
              value={post.status}
              onChange={e => onStatusChange(e.target.value as FeedbackStatus)}
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.85rem' }}
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Status: <StatusBadge status={post.status} />
          </div>
        )}
        {canDeletePost && (
          <button
            onClick={onDeletePost}
            style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}
          >
            <Trash2 size={13} /> Delete post
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.55, color: 'var(--text-primary)' }}>
        {post.message}
      </div>

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {post.images.map((src, i) => (
            <img
              key={i} src={src} alt=""
              onClick={() => onOpenLightbox(post.images, i)}
              style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '6px', cursor: 'zoom-in', border: '1px solid var(--border-color)' }}
            />
          ))}
        </div>
      )}

      {/* Replies */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {post.replies?.length || 0} {post.replies?.length === 1 ? 'reply' : 'replies'}
        </div>
        {(post.replies || []).map(r => (
          <ReplyItem
            key={r.id}
            reply={r}
            canDelete={isSuperAdmin || r.authorId === currentUserId}
            onDelete={() => onDeleteReply(r.id)}
          />
        ))}

        {/* Reply composer */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.25rem' }}>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitReply(); }}
            placeholder={isSuperAdmin ? 'Reply as admin… (Ctrl+Enter to send)' : 'Add a reply… (Ctrl+Enter to send)'}
            rows={2}
            style={{ flex: 1, background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.6rem 0.75rem', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            onClick={submitReply}
            disabled={sending || !replyText.trim()}
            className="btn-primary"
            style={{ padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: sending || !replyText.trim() ? 0.5 : 1 }}
          >
            <Send size={14} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplyItem({ reply, canDelete, onDelete }: { reply: FeedbackReply; canDelete: boolean; onDelete: () => void }) {
  return (
    <div style={{
      padding: '0.6rem 0.85rem',
      background: reply.isAdmin ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${reply.isAdmin ? 'rgba(99,102,241,0.3)' : 'var(--border-color)'}`,
      borderRadius: '8px',
      display: 'flex', flexDirection: 'column', gap: '0.3rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{reply.authorName}</span>
        {reply.isAdmin && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600 }}>
            <Shield size={10} /> Admin
          </span>
        )}
        <span>· {timeAgo(reply.createdAt)}</span>
        {canDelete && (
          <button
            onClick={onDelete}
            title="Delete reply"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', display: 'flex' }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5 }}>{reply.message}</div>
    </div>
  );
}

// ─── New-post composer ──────────────────────────────────────────────────────

function ComposerModal({
  appPassword, onClose, onSubmit,
}: {
  appPassword: string;
  onClose: () => void;
  onSubmit: (title: string, message: string, images: string[]) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<{ name: string; previewUrl: string; base64: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => () => { files.forEach(f => URL.revokeObjectURL(f.previewUrl)); }, [files]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addFiles = async (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    const additions = await Promise.all(arr.map(async f => ({
      name: f.name || 'screenshot.png',
      previewUrl: URL.createObjectURL(f),
      base64: await fileToBase64(f),
    })));
    setFiles(prev => [...prev, ...additions]);
  };

  // Paste-from-clipboard handler — captures screenshots typed via Win+Shift+S etc.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length > 0) {
        e.preventDefault();
        addFiles(imgs);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeFile = (i: number) => {
    setFiles(prev => {
      URL.revokeObjectURL(prev[i].previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    if (files.length === 0) return [];
    const resp = await fetch('/api/images/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` },
      body: JSON.stringify({ images: files.map(f => f.base64) }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Image upload failed');
    }
    const data = await resp.json();
    return data.urls || [];
  };

  const submit = async () => {
    if (!title.trim()) { toast('Add a title.', 'error'); return; }
    if (!message.trim()) { toast('Add a description.', 'error'); return; }
    setSubmitting(true);
    try {
      const urls = await uploadImages();
      await onSubmit(title.trim(), message.trim(), urls);
    } catch (e: any) {
      toast(e.message || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel"
        style={{
          width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
          padding: '1.5rem', borderRadius: '12px',
          display: 'flex', flexDirection: 'column', gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>New Feedback Post</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title (e.g. 'Bulk uploader fails on PDFs')"
          maxLength={200}
          style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.95rem' }}
        />

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Describe the issue or request. You can paste screenshots directly (Ctrl/Cmd+V)."
          rows={6}
          style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent-color)' : 'var(--border-color)'}`,
            borderRadius: '8px', padding: '1rem',
            textAlign: 'center', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: '0.85rem',
            background: dragOver ? 'rgba(99,102,241,0.06)' : 'transparent',
            transition: 'all 0.15s',
          }}
        >
          <Upload size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Drop screenshots, paste from clipboard, or click to browse
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            style={{ display: 'none' }}
          />
        </div>

        {/* Attachment previews */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {files.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={f.previewUrl} alt="" style={{ width: '90px', height: '70px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                <button
                  onClick={() => removeFile(i)}
                  title="Remove"
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px', borderRadius: '50%', background: '#ef4444', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onClose} className="btn-icon" style={{ padding: '0.55rem 1rem' }}>Cancel</button>
          <button onClick={submit} disabled={submitting} className="btn-primary" style={{ padding: '0.55rem 1.1rem', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
