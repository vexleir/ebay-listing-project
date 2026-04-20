import { useMemo, useState } from 'react';
import { Users, UserPlus, Edit2, Trash2, Check, X, DollarSign, Calendar, ExternalLink, Package, ClipboardList, Undo2, Plus } from 'lucide-react';
import type { StagedListing, Consignor } from '../types';
import { calculateNetProfit } from '../utils/fees';
import { useToast } from '../context/ToastContext';
import ResultsEditor from './ResultsEditor';

interface ConsignmentTabProps {
  staged: StagedListing[];
  listed: StagedListing[];
  candidateStaged: StagedListing[]; // non-consignment staged listings, available to assign
  consignors: Consignor[];
  onCreateConsignor: (c: Omit<Consignor, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateConsignor: (id: string, updates: Partial<Consignor>) => Promise<void>;
  onDeleteConsignor: (id: string) => Promise<void>;
  onUpdateStagedListing: (listing: StagedListing) => Promise<void>;
  onMarkSold: (id: string, soldPrice: string, soldAt: number) => Promise<void>;
  onAssignConsignment: (id: string, isConsignment: boolean, consignorId?: string, consignmentFeePct?: number) => Promise<void>;
  onMarkPaid: (id: string, payoutAmount: string) => Promise<void>;
  onUnmarkPaid: (id: string) => Promise<void>;
  appPassword: string;
}

type SubTab = 'items' | 'consignors';

function fmt(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface PayoutCalc {
  net: number;
  ourTake: number;
  consignorPayout: number;
  feeRate: number;
}

function calcPayout(listing: StagedListing): PayoutCalc {
  const price = listing.soldPrice || listing.priceRecommendation;
  const { netProfit, feeRate } = calculateNetProfit(
    price,
    listing.costBasis,
    listing.category,
    listing.shippingLabelCost
  );
  const cutPct = typeof listing.consignmentFeePct === 'number' ? listing.consignmentFeePct : 50;
  const ourPortion = netProfit >= 0 ? netProfit * (cutPct / 100) : netProfit; // we absorb losses
  const theirPortion = netProfit >= 0 ? netProfit * (1 - cutPct / 100) : 0;
  return {
    net: netProfit,
    ourTake: ourPortion,
    consignorPayout: theirPortion,
    feeRate,
  };
}

export default function ConsignmentTab(props: ConsignmentTabProps) {
  const {
    staged, listed, candidateStaged, consignors,
    onCreateConsignor, onUpdateConsignor, onDeleteConsignor,
    onUpdateStagedListing, onAssignConsignment, onMarkPaid, onUnmarkPaid,
    onMarkSold,
    appPassword,
  } = props;

  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>('items');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [consignorModalOpen, setConsignorModalOpen] = useState(false);
  const [editingConsignorId, setEditingConsignorId] = useState<string | null>(null);

  const allItems = useMemo(() => [...staged, ...listed], [staged, listed]);

  // Stats
  const stats = useMemo(() => {
    let activeCount = 0, soldCount = 0, owed = 0, paid = 0;
    for (const item of allItems) {
      if (item.soldAt) {
        soldCount++;
        const p = calcPayout(item);
        if (item.consignorPaidAt) {
          paid += parseFloat(item.consignorPayoutAmount || '0') || p.consignorPayout;
        } else {
          owed += p.consignorPayout;
        }
      } else if (item.status === 'listed') {
        activeCount++;
      }
    }
    return { total: allItems.length, activeCount, soldCount, owed, paid };
  }, [allItems]);

  const consignorMap = useMemo(() => {
    const m = new Map<string, Consignor>();
    for (const c of consignors) m.set(c.id, c);
    return m;
  }, [consignors]);

  // ─── Edit view ─────────────────────────────────────────────────────────────
  if (editingId) {
    const l = allItems.find(x => x.id === editingId);
    if (!l) { setEditingId(null); return null; }
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', height: '80vh' }}>
        <ResultsEditor
          data={{
            title: l.title, description: l.description, condition: l.condition,
            category: l.category, priceRecommendation: l.priceRecommendation,
            shippingEstimate: l.shippingEstimate, itemSpecifics: l.itemSpecifics,
            sku: l.sku, sellerNotes: l.sellerNotes, costBasis: l.costBasis,
            shippingLabelCost: l.shippingLabelCost, tags: l.tags,
            collectionCodes: l.collectionCodes,
          }}
          images={[]}
          existingImageUrls={l.images || []}
          appPassword={appPassword}
          onStage={(updatedData) => {
            onUpdateStagedListing({ ...l, ...updatedData, updatedAt: Date.now() });
            setEditingId(null);
            toast('Consignment listing saved.', 'success');
          }}
          onCancel={() => setEditingId(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={22} /> Consignment
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Inventory sold on behalf of others. Track our share, consignor payouts, and paid status.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={() => setAssignModalOpen(true)}>
            <Plus size={16} /> Add from Staged
          </button>
          <button className="btn-primary" onClick={() => { setEditingConsignorId(null); setConsignorModalOpen(true); }}>
            <UserPlus size={16} /> New Consignor
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <StatTile icon={<Package size={18} />} label="Total Items" value={String(stats.total)} />
        <StatTile icon={<ClipboardList size={18} />} label="Active Listings" value={String(stats.activeCount)} />
        <StatTile icon={<Check size={18} />} label="Sold" value={String(stats.soldCount)} />
        <StatTile icon={<DollarSign size={18} />} label="Owed to Consignors" value={fmt(stats.owed)} accent="#f59e0b" />
        <StatTile icon={<DollarSign size={18} />} label="Paid Out" value={fmt(stats.paid)} accent="var(--success)" />
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <SubTabButton active={subTab === 'items'} onClick={() => setSubTab('items')}>Items ({allItems.length})</SubTabButton>
        <SubTabButton active={subTab === 'consignors'} onClick={() => setSubTab('consignors')}>Consignors ({consignors.length})</SubTabButton>
      </div>

      {subTab === 'items' ? (
        <ItemsList
          items={allItems}
          consignorMap={consignorMap}
          onEdit={(id) => setEditingId(id)}
          onUnassign={(id) => onAssignConsignment(id, false)}
          onMarkPaid={onMarkPaid}
          onUnmarkPaid={onUnmarkPaid}
          onMarkSold={onMarkSold}
        />
      ) : (
        <ConsignorsList
          consignors={consignors}
          allItems={allItems}
          onEdit={(id) => { setEditingConsignorId(id); setConsignorModalOpen(true); }}
          onDelete={async (c) => {
            const inUse = allItems.some(l => l.consignorId === c.id);
            if (inUse) { toast('Cannot delete: consignor has items assigned.', 'error'); return; }
            if (!window.confirm(`Delete consignor "${c.name}"?`)) return;
            await onDeleteConsignor(c.id);
            toast(`Consignor "${c.name}" deleted.`, 'success');
          }}
        />
      )}

      {assignModalOpen && (
        <AssignModal
          candidates={candidateStaged}
          consignors={consignors}
          onClose={() => setAssignModalOpen(false)}
          onAssign={async (listingId, consignorId, pct) => {
            await onAssignConsignment(listingId, true, consignorId, pct);
            setAssignModalOpen(false);
            toast('Item marked as consignment.', 'success');
          }}
        />
      )}

      {consignorModalOpen && (
        <ConsignorModal
          consignor={editingConsignorId ? consignors.find(c => c.id === editingConsignorId) || null : null}
          onClose={() => { setConsignorModalOpen(false); setEditingConsignorId(null); }}
          onSave={async (data) => {
            if (editingConsignorId) {
              await onUpdateConsignor(editingConsignorId, data);
              toast('Consignor updated.', 'success');
            } else {
              await onCreateConsignor(data);
              toast('Consignor added.', 'success');
            }
            setConsignorModalOpen(false);
            setEditingConsignorId(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Stat tile ───────────────────────────────────────────────────────────────
function StatTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.75rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: accent || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ─── Sub-tab button ──────────────────────────────────────────────────────────
function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        padding: '0.6rem 1rem',
        cursor: 'pointer',
        fontWeight: active ? 600 : 500,
        fontSize: '0.92rem',
      }}
    >
      {children}
    </button>
  );
}

// ─── Items list ──────────────────────────────────────────────────────────────
interface ItemsListProps {
  items: StagedListing[];
  consignorMap: Map<string, Consignor>;
  onEdit: (id: string) => void;
  onUnassign: (id: string) => Promise<void>;
  onMarkPaid: (id: string, payoutAmount: string) => Promise<void>;
  onUnmarkPaid: (id: string) => Promise<void>;
  onMarkSold: (id: string, soldPrice: string, soldAt: number) => Promise<void>;
}

function ItemsList({ items, consignorMap, onEdit, onUnassign, onMarkPaid, onUnmarkPaid, onMarkSold }: ItemsListProps) {
  const { toast } = useToast();
  const [markSoldId, setMarkSoldId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', background: 'var(--glass-bg)', border: '1px dashed var(--border-color)', borderRadius: 10 }}>
        <Users size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
        <div>No consignment items yet.</div>
        <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>Use "Add from Staged" to assign an existing staged listing to a consignor.</div>
      </div>
    );
  }

  // Sort: sold-unpaid first, then sold-paid, then listed, then staged
  const sorted = [...items].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  function rank(l: StagedListing): number {
    if (l.soldAt && !l.consignorPaidAt) return 0;
    if (l.soldAt && l.consignorPaidAt) return 3;
    if (l.status === 'listed') return 1;
    return 2;
  }

  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Consignor</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Net</th>
              <th style={thStyle}>Our %</th>
              <th style={thStyle}>Our Take</th>
              <th style={thStyle}>Consignor Gets</th>
              <th style={thStyle}>Paid?</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(item => {
              const payout = calcPayout(item);
              const consignor = item.consignorId ? consignorMap.get(item.consignorId) : null;
              const statusLabel = item.soldAt ? 'Sold' : item.status === 'listed' ? 'Listed' : 'Staged';
              const statusColor = item.soldAt ? 'var(--success)' : item.status === 'listed' ? '#3b82f6' : '#a855f7';
              const img = (item.images || [])[0];
              return (
                <tr key={item.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {img ? (
                        <img src={img} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 5 }} />
                      )}
                      <div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                        {item.title}
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ background: statusColor + '22', color: statusColor, padding: '2px 8px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600 }}>
                      {statusLabel}
                    </span>
                  </td>
                  <td style={tdStyle}>{consignor ? consignor.name : <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                  <td style={tdStyle}>{item.soldPrice ? fmt(parseFloat(item.soldPrice) || 0) : fmt(parseFloat(item.priceRecommendation) || 0)}</td>
                  <td style={{ ...tdStyle, color: payout.net >= 0 ? 'var(--success)' : '#ef4444' }}>{fmt(payout.net)}</td>
                  <td style={tdStyle}>{typeof item.consignmentFeePct === 'number' ? `${item.consignmentFeePct}%` : '—'}</td>
                  <td style={tdStyle}>{fmt(payout.ourTake)}</td>
                  <td style={tdStyle}><strong>{fmt(payout.consignorPayout)}</strong></td>
                  <td style={tdStyle}>
                    {item.soldAt ? (
                      item.consignorPaidAt ? (
                        <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                          <Check size={14} /> {new Date(item.consignorPaidAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>Unpaid</span>
                      )
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <button className="btn-icon" title="Edit" onClick={() => onEdit(item.id)}><Edit2 size={14} /></button>
                      {item.status === 'listed' && !item.soldAt && (
                        <button className="btn-icon" title="Mark Sold" onClick={() => setMarkSoldId(item.id)}><DollarSign size={14} /></button>
                      )}
                      {item.soldAt && !item.consignorPaidAt && (
                        <button
                          className="btn-icon"
                          title="Mark Paid"
                          style={{ color: 'var(--success)' }}
                          onClick={async () => {
                            const amount = window.prompt(
                              `Pay ${consignor?.name || 'consignor'} ${fmt(payout.consignorPayout)}?\n\nEnter payout amount to confirm:`,
                              payout.consignorPayout.toFixed(2)
                            );
                            if (amount === null) return;
                            const parsed = parseFloat(amount);
                            if (Number.isNaN(parsed) || parsed < 0) { toast('Invalid amount.', 'error'); return; }
                            await onMarkPaid(item.id, parsed.toFixed(2));
                            toast('Marked paid.', 'success');
                          }}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {item.soldAt && item.consignorPaidAt && (
                        <button
                          className="btn-icon"
                          title="Unmark Paid"
                          onClick={async () => {
                            if (!window.confirm('Unmark this as paid?')) return;
                            await onUnmarkPaid(item.id);
                            toast('Unmarked as paid.', 'info');
                          }}
                        >
                          <Undo2 size={14} />
                        </button>
                      )}
                      <button
                        className="btn-icon"
                        title="Remove from Consignment"
                        onClick={async () => {
                          if (!window.confirm('Remove consignment flag? This item will return to the regular inventory.')) return;
                          await onUnassign(item.id);
                        }}
                      >
                        <X size={14} />
                      </button>
                      {item.ebayDraftId && (
                        <a
                          className="btn-icon"
                          title="View on eBay"
                          href={`https://www.ebay.com/itm/${item.ebayDraftId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {markSoldId && (
        <MarkSoldModal
          listing={items.find(i => i.id === markSoldId)!}
          onClose={() => setMarkSoldId(null)}
          onConfirm={async (price, soldAt) => {
            await onMarkSold(markSoldId, price, soldAt);
            setMarkSoldId(null);
            toast('Marked as sold.', 'success');
          }}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.65rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em' };
const tdStyle: React.CSSProperties = { padding: '0.65rem 0.75rem', verticalAlign: 'middle' };

// ─── Consignors list ─────────────────────────────────────────────────────────
interface ConsignorsListProps {
  consignors: Consignor[];
  allItems: StagedListing[];
  onEdit: (id: string) => void;
  onDelete: (c: Consignor) => void;
}

function ConsignorsList({ consignors, allItems, onEdit, onDelete }: ConsignorsListProps) {
  if (consignors.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', background: 'var(--glass-bg)', border: '1px dashed var(--border-color)', borderRadius: 10 }}>
        <UserPlus size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
        <div>No consignors yet.</div>
        <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>Use "New Consignor" to add the first one.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
      {consignors.map(c => {
        const items = allItems.filter(l => l.consignorId === c.id);
        const owed = items.filter(i => i.soldAt && !i.consignorPaidAt).reduce((sum, i) => sum + calcPayout(i).consignorPayout, 0);
        const paid = items
          .filter(i => i.consignorPaidAt)
          .reduce((sum, i) => sum + (parseFloat(i.consignorPayoutAmount || '0') || 0), 0);
        return (
          <div key={c.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{c.name}</div>
                {c.email && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{c.email}</div>}
                {c.phone && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{c.phone}</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="btn-icon" title="Edit" onClick={() => onEdit(c.id)}><Edit2 size={14} /></button>
                <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => onDelete(c)}><Trash2 size={14} /></button>
              </div>
            </div>
            {c.notes && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontStyle: 'italic' }}>{c.notes}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.78rem' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Items</div>
                <div style={{ fontWeight: 600 }}>{items.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Owed</div>
                <div style={{ fontWeight: 600, color: owed > 0 ? '#f59e0b' : 'var(--text-primary)' }}>{fmt(owed)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Paid</div>
                <div style={{ fontWeight: 600, color: 'var(--success)' }}>{fmt(paid)}</div>
              </div>
            </div>
            {typeof c.defaultSplitPct === 'number' && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Default split: <strong>{c.defaultSplitPct}%</strong> to us
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Consignor create/edit modal ─────────────────────────────────────────────
function ConsignorModal({ consignor, onClose, onSave }: {
  consignor: Consignor | null;
  onClose: () => void;
  onSave: (data: Omit<Consignor, 'id' | 'createdAt'>) => Promise<void>;
}) {
  const [name, setName] = useState(consignor?.name || '');
  const [email, setEmail] = useState(consignor?.email || '');
  const [phone, setPhone] = useState(consignor?.phone || '');
  const [notes, setNotes] = useState(consignor?.notes || '');
  const [defaultSplitPct, setDefaultSplitPct] = useState<string>(
    typeof consignor?.defaultSplitPct === 'number' ? String(consignor.defaultSplitPct) : '50'
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const splitNum = parseFloat(defaultSplitPct);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        defaultSplitPct: Number.isFinite(splitNum) ? splitNum : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={consignor ? 'Edit Consignor' : 'New Consignor'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Field label="Name *"><input className="input-base" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" /></Field>
        <Field label="Email"><input className="input-base" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" /></Field>
        <Field label="Phone"><input className="input-base" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" /></Field>
        <Field label="Default split % to us">
          <input className="input-base" type="number" min="0" max="100" step="1" value={defaultSplitPct} onChange={e => setDefaultSplitPct(e.target.value)} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Our commission. Consignor gets the rest.</div>
        </Field>
        <Field label="Notes">
          <textarea className="input-base" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Friend of the store, prefers Venmo payouts..." />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : consignor ? 'Save Changes' : 'Create Consignor'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Assign existing staged listing to consignment ───────────────────────────
function AssignModal({ candidates, consignors, onClose, onAssign }: {
  candidates: StagedListing[];
  consignors: Consignor[];
  onClose: () => void;
  onAssign: (listingId: string, consignorId: string, pct: number) => Promise<void>;
}) {
  const [listingId, setListingId] = useState('');
  const [consignorId, setConsignorId] = useState('');
  const [pct, setPct] = useState('50');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(l => l.title.toLowerCase().includes(q) || (l.sku || '').toLowerCase().includes(q));
  }, [candidates, search]);

  const handleConsignorChange = (id: string) => {
    setConsignorId(id);
    const c = consignors.find(x => x.id === id);
    if (c && typeof c.defaultSplitPct === 'number') setPct(String(c.defaultSplitPct));
  };

  const canSave = listingId && consignorId && Number.isFinite(parseFloat(pct));

  return (
    <ModalShell title="Assign Staged Listing to Consignment" onClose={onClose}>
      {consignors.length === 0 ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Add a consignor first using "New Consignor".
        </div>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No unassigned staged listings available.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Field label="Consignor *">
            <select className="input-base" value={consignorId} onChange={e => handleConsignorChange(e.target.value)}>
              <option value="">— Select consignor —</option>
              {consignors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Our commission % *">
            <input className="input-base" type="number" min="0" max="100" step="1" value={pct} onChange={e => setPct(e.target.value)} />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Net profit × this % goes to us; remainder to consignor.</div>
          </Field>
          <Field label="Listing *">
            <input className="input-base" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staged listings..." style={{ marginBottom: '0.4rem' }} />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '0.8rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>No matches.</div>
              ) : filtered.map(l => (
                <label key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', background: listingId === l.id ? 'rgba(168,85,247,0.12)' : 'transparent' }}>
                  <input type="radio" name="listing" checked={listingId === l.id} onChange={() => setListingId(l.id)} />
                  {(l.images || [])[0] && <img src={(l.images || [])[0]} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{l.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {fmt(parseFloat(l.priceRecommendation) || 0)}
                      {l.sku ? ` · SKU ${l.sku}` : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Field>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button
          className="btn-primary"
          disabled={!canSave || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onAssign(listingId, consignorId, parseFloat(pct));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Assigning...' : 'Assign'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Mark sold modal ─────────────────────────────────────────────────────────
function MarkSoldModal({ listing, onClose, onConfirm }: {
  listing: StagedListing;
  onClose: () => void;
  onConfirm: (price: string, soldAt: number) => Promise<void>;
}) {
  const [price, setPrice] = useState(listing.priceRecommendation || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  return (
    <ModalShell title="Mark as Sold" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{listing.title}</div>
        <Field label="Sold price *">
          <input className="input-base" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
        </Field>
        <Field label="Sold date *">
          <input className="input-base" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button
          className="btn-primary"
          disabled={!price || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm(price, new Date(date).getTime());
            } finally { setSaving(false); }
          }}
        >
          <Calendar size={14} /> {saving ? 'Saving...' : 'Confirm'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Shared modal shell ──────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div
        style={{ background: '#14141f', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.25rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontWeight: 500 }}>{label}</div>
      {children}
    </label>
  );
}
