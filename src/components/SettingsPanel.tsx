import { useState, useEffect } from 'react';
import type React from 'react';
import { Settings, Save, Download, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, Link, Unlink } from 'lucide-react';
import type { UserSettings, EbayPolicies, StagedListing } from '../types';
import { useToast } from '../context/ToastContext';

const SectionHeader = ({ title, sub }: { title: string; sub?: string }) => (
  <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
    {sub && <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{sub}</p>}
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '1rem' }}>
    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>{label}</label>
    {children}
    {hint && <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8 }}>{hint}</p>}
  </div>
);

interface SettingsPanelProps {
  appPassword: string;
  isEbayConnected: boolean;
  isShopifyConnected: boolean;
  onShopifyConnectionChange: (connected: boolean) => void;
  staged: StagedListing[];
  listed: StagedListing[];
}

export default function SettingsPanelView({ appPassword, isEbayConnected, isShopifyConnected, onShopifyConnectionChange, staged, listed }: SettingsPanelProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings>({});
  const [policies, setPolicies] = useState<EbayPolicies | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [isDisconnectingShopify, setIsDisconnectingShopify] = useState(false);
  const [webhookLastReceived, setWebhookLastReceived] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ page: number; totalPages: number } | null>(null);
  const [metafieldDefs, setMetafieldDefs] = useState<{ productDefs: Record<string,string>; variantDefs: Record<string,string> } | null>(null);
  const [loadingMetafieldDefs, setLoadingMetafieldDefs] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` };

  useEffect(() => {
    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${appPassword}` } })
      .then(r => r.json())
      .then(data => setSettings(data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
    if (isShopifyConnected) {
      fetch('/api/shopify/webhook-status', { headers: { 'Authorization': `Bearer ${appPassword}` } })
        .then(r => r.json())
        .then(data => setWebhookLastReceived(data.lastReceivedAt || null))
        .catch(() => {});
    }
  }, [appPassword, isShopifyConnected]);

  const fetchPolicies = async () => {
    if (!isEbayConnected) { toast('Connect to eBay first to load policies.', 'error'); return; }
    setLoadingPolicies(true);
    try {
      const resp = await fetch('/api/ebay/policies', { headers: { 'Authorization': `Bearer ${appPassword}` } });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setPolicies(data);
    } catch (e: any) {
      toast('Failed to load eBay policies: ' + e.message, 'error');
    } finally {
      setLoadingPolicies(false);
    }
  };

  const handleShopifyConnect = async () => {
    setIsConnectingShopify(true);
    try {
      const resp = await fetch('/api/shopify/auth-url', { headers: { 'Authorization': `Bearer ${appPassword}` } });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error || 'Failed to get Shopify auth URL');
    } catch (e: any) {
      toast('Shopify connect error: ' + e.message, 'error');
      setIsConnectingShopify(false);
    }
  };

  const handleShopifyDisconnect = async () => {
    setIsDisconnectingShopify(true);
    try {
      await fetch('/api/shopify/tokens', { method: 'DELETE', headers: { 'Authorization': `Bearer ${appPassword}` } });
      onShopifyConnectionChange(false);
      toast('Shopify disconnected.', 'success');
    } catch (e: any) {
      toast('Disconnect error: ' + e.message, 'error');
    } finally {
      setIsDisconnectingShopify(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/settings', { method: 'POST', headers, body: JSON.stringify(settings) });
      if (!resp.ok) throw new Error(await resp.text());
      toast('Settings saved.', 'success');
    } catch (e: any) {
      toast('Failed to save settings: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshFromEbay = async () => {
    if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; }
    setIsRefreshing(true);
    setRefreshProgress(null);
    let totalRefreshed = 0;
    let totalImported = 0;
    try {
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        setRefreshProgress({ page, totalPages });
        const resp = await fetch(`/api/ebay/refresh-listings?page=${page}`, { method: 'POST', headers });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        totalRefreshed += data.refreshed;
        totalImported += data.imported;
        totalPages = data.totalPages;
        page++;
      }
      const parts = [];
      if (totalRefreshed > 0) parts.push(`${totalRefreshed} refreshed`);
      if (totalImported > 0) parts.push(`${totalImported} newly imported`);
      toast(`eBay sync complete: ${parts.length ? parts.join(', ') : 'nothing changed'}.`, 'success');
    } catch (e: any) {
      toast('Refresh failed: ' + e.message, 'error');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const handleExportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      staged,
      listed,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listingstager-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${staged.length + listed.length} listings as JSON.`, 'success');
  };

  const set = (key: keyof UserSettings, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading settings...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Settings size={24} className="text-gradient" /> Settings
      </h2>

      {/* Setup checklist */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>Setup Checklist</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { ok: isEbayConnected, label: 'eBay account connected', action: !isEbayConnected ? 'Connect in the top nav bar' : null },
            { ok: isShopifyConnected, label: 'Shopify store connected', action: !isShopifyConnected ? 'Connect below in Shopify Integration' : null },
            { ok: !!(settings.sellerZip), label: 'Seller ZIP code configured', action: !settings.sellerZip ? 'Set below in Seller Info' : null },
            { ok: !!(settings.defaultFulfillmentPolicyId), label: 'Shipping policy selected', action: !(settings.defaultFulfillmentPolicyId) ? 'Load policies below' : null },
            { ok: !!(settings.storeName), label: 'Store name set (for description templates)', action: !settings.storeName ? 'Set below in Seller Info' : null },
          ].map(({ ok, label, action }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              {ok
                ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                : <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />}
              <span style={{ color: ok ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
              {action && <span style={{ fontSize: '0.75rem', color: '#f59e0b', opacity: 0.8 }}>— {action}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Seller Info */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Seller Info" sub="Used in eBay listings and your store branding" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
          <Field label="Store / Seller Name" hint="Used in description footer templates">
            <input className="input-base" value={settings.storeName || ''} onChange={e => set('storeName', e.target.value)} placeholder="e.g. My eBay Store" />
          </Field>
          <Field label="Seller ZIP Code" hint="Used for eBay listing location accuracy">
            <input className="input-base" value={settings.sellerZip || ''} onChange={e => set('sellerZip', e.target.value)} placeholder="e.g. 90210" maxLength={10} />
          </Field>
          <Field label="Seller Location" hint="Country or city shown on listings">
            <input className="input-base" value={settings.sellerLocation || ''} onChange={e => set('sellerLocation', e.target.value)} placeholder="e.g. United States" />
          </Field>
        </div>
      </div>

      {/* eBay Policies */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="eBay Seller Policies" sub="Set defaults used for every new eBay listing push. Override per-listing in the push modal." />
        {!policies ? (
          <button className="btn-secondary" onClick={fetchPolicies} disabled={loadingPolicies || !isEbayConnected}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1rem' }}>
            {loadingPolicies ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
            {isEbayConnected ? 'Load My eBay Policies' : 'Connect eBay to Load Policies'}
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1rem' }}>
            <Field label="Default Shipping Policy">
              <select className="input-base" value={settings.defaultFulfillmentPolicyId || ''} onChange={e => set('defaultFulfillmentPolicyId', e.target.value)}>
                <option value="">— Select —</option>
                {policies.fulfillmentPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Default Payment Policy">
              <select className="input-base" value={settings.defaultPaymentPolicyId || ''} onChange={e => set('defaultPaymentPolicyId', e.target.value)}>
                <option value="">— Select —</option>
                {policies.paymentPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Default Return Policy">
              <select className="input-base" value={settings.defaultReturnPolicyId || ''} onChange={e => set('defaultReturnPolicyId', e.target.value)}>
                <option value="">— Select —</option>
                {policies.returnPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, opacity: 0.7 }}>
          Tip: If policies were previously set via environment variables, they continue to work as fallback.
        </p>
      </div>

      {/* AI Settings */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="AI Settings" sub="Controls which Gemini model is used for listing generation" />
        <Field label="Promoted Listing %" hint="eBay ad rate applied to all listings. Used in net profit calculations on Analytics. Set to 0 if you don't use Promoted Listings.">
          <input className="input-base" type="number" min="0" max="20" step="0.5"
            value={settings.promotedListingPct ?? 0}
            onChange={e => setSettings(prev => ({ ...prev, promotedListingPct: parseFloat(e.target.value) || 0 }))}
            placeholder="e.g. 5" style={{ maxWidth: '160px' }} />
        </Field>
        <Field label="Preferred Gemini Model" hint="Flash is faster and cheaper. Pro is more accurate for complex items.">
          <select className="input-base" value={settings.geminiModel || 'flash'} onChange={e => set('geminiModel', e.target.value as 'flash' | 'pro')} style={{ maxWidth: '320px' }}>
            <option value="flash">Gemini 1.5 Flash (recommended — fast, cost-efficient)</option>
            <option value="pro">Gemini 1.5 Pro (slower, better for complex items)</option>
          </select>
        </Field>
      </div>

      {/* Description Templates */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Description Templates" sub="HTML header and footer automatically wrapped around every AI-generated description when pushed to eBay. Stored description stays clean — wrapper is applied at push time only." />
        <Field label="Description Header HTML" hint="Appears BEFORE the AI-generated description. Good for store logo, banner, branding.">
          <textarea className="input-base" rows={4} value={settings.descriptionHeader || ''} onChange={e => set('descriptionHeader', e.target.value)}
            placeholder={'<div style="text-align:center;"><img src="https://your-store-banner.jpg" /></div>'} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
        </Field>
        <Field label="Description Footer HTML" hint="Appears AFTER the AI-generated description. Good for store policies, contact info, return terms.">
          <textarea className="input-base" rows={4} value={settings.descriptionFooter || ''} onChange={e => set('descriptionFooter', e.target.value)}
            placeholder={'<div style="margin-top:20px;border-top:1px solid #ccc;padding-top:10px;font-size:12px;">Questions? Message us!</div>'}
            style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
        </Field>
        {(settings.descriptionHeader || settings.descriptionFooter) && (
          <div style={{ padding: '8px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: '6px', fontSize: '0.82rem', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
            Template active — will be wrapped around description on every eBay push.
          </div>
        )}
      </div>

      {/* Shopify Integration */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Shopify Integration" sub="Connect your Shopify store to cross-list items and auto-delist when sold" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '0.75rem 1rem',
            background: isShopifyConnected ? 'rgba(34,197,94,0.08)' : 'rgba(100,100,100,0.08)',
            border: `1px solid ${isShopifyConnected ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'}`,
            borderRadius: '8px', fontSize: '0.875rem',
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isShopifyConnected ? '#22c55e' : 'var(--text-secondary)', flexShrink: 0 }} />
            <span>{isShopifyConnected ? 'Connected to bxjqfz-ku.myshopify.com' : 'Not connected'}</span>
          </div>
          {isShopifyConnected ? (
            <button
              className="btn-secondary"
              onClick={handleShopifyDisconnect}
              disabled={isDisconnectingShopify}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              <Unlink size={15} />
              {isDisconnectingShopify ? 'Disconnecting…' : 'Disconnect Shopify'}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleShopifyConnect}
              disabled={isConnectingShopify}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #96bf48, #5e8e3e)' }}
            >
              <Link size={15} />
              {isConnectingShopify ? 'Redirecting…' : 'Connect Shopify'}
            </button>
          )}
        </div>
        {!isShopifyConnected && (
          <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.75 }}>
            You'll be redirected to Shopify to authorize access. Make sure you've added the redirect URL to your app in the Shopify Partners Dashboard first.
          </p>
        )}
        {isShopifyConnected && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: webhookLastReceived ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
            {webhookLastReceived
              ? `Webhook active · last received ${new Date(webhookLastReceived).toLocaleString()}`
              : 'Webhook not yet received — will activate on first Shopify sale'}
          </div>
        )}
        {isShopifyConnected && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => setSettings(prev => ({ ...prev, autoShopifyCrosslist: !prev.autoShopifyCrosslist }))}
                style={{
                  width: '40px', height: '22px', borderRadius: '11px', flexShrink: 0, cursor: 'pointer',
                  background: settings.autoShopifyCrosslist ? '#96bf48' : 'var(--border-color)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px', left: settings.autoShopifyCrosslist ? '21px' : '3px',
                  width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Auto cross-list to Shopify</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  When enabled, every eBay push automatically lists the item on Shopify too. Remember to save settings.
                </div>
              </div>
            </label>
          </div>
        )}

        {isShopifyConnected && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Metafield Definitions</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Shows the actual namespace.key and type configured in your Shopify store — used when pushing metafields.
                </div>
              </div>
              <button
                onClick={async () => {
                  setLoadingMetafieldDefs(true);
                  try {
                    const r = await fetch('/api/shopify/metafield-defs', { headers: { 'Authorization': `Bearer ${appPassword}` } });
                    const data = await r.json();
                    if (data.error) throw new Error(data.error);
                    setMetafieldDefs(data);
                  } catch (e: any) {
                    toast('Could not fetch metafield definitions: ' + e.message, 'error');
                  } finally {
                    setLoadingMetafieldDefs(false);
                  }
                }}
                disabled={loadingMetafieldDefs}
                style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {loadingMetafieldDefs ? 'Loading…' : 'Check Definitions'}
              </button>
            </div>
            {metafieldDefs && (
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Product metafields', defs: metafieldDefs.productDefs },
                  { label: 'Variant metafields', defs: metafieldDefs.variantDefs },
                ].map(({ label, defs }) => (
                  <div key={label} style={{ flex: 1, minWidth: '220px' }}>
                    <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label} ({Object.keys(defs).length})</p>
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px 10px', maxHeight: '180px', overflowY: 'auto' }}>
                      {Object.keys(defs).length === 0
                        ? <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>None found</p>
                        : Object.entries(defs).map(([key, type]) => (
                          <div key={key} style={{ fontSize: '0.72rem', marginBottom: '3px', display: 'flex', gap: '8px' }}>
                            <code style={{ color: '#a5b4fc', flex: 1 }}>{key}</code>
                            <span style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>{type}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Management */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Data Management" sub="Export your listing data or sync changes from eBay" />
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleExportData}>
            <Download size={16} /> Export All Listings (JSON)
          </button>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleRefreshFromEbay} disabled={isRefreshing || !isEbayConnected}>
            {isRefreshing ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
            {isRefreshing
              ? refreshProgress
                ? `Syncing page ${refreshProgress.page} of ${refreshProgress.totalPages}…`
                : 'Starting…'
              : 'Refresh from eBay'}
          </button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {staged.length} staged + {listed.length} listed = {staged.length + listed.length} total listings
          </span>
        </div>
        <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
          Export includes all listing metadata, prices, tags, cost basis, and sold data. Images are stored as Cloudinary URLs.<br />
          Refresh from eBay re-pulls images, title, price, and condition for all imported listings — useful if images are missing or you've edited listings directly on eBay.
        </p>
      </div>

      {/* Links */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Quick Links" />
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a href="https://www.ebay.com/mes/sellerhub" target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <ExternalLink size={14} /> eBay Seller Hub
          </a>
          <a href="https://www.ebay.com/sh/reports/payments" target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <ExternalLink size={14} /> Payment Reports
          </a>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <ExternalLink size={14} /> Gemini API Console
          </a>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '2rem' }}>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontSize: '0.95rem' }}
          onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
