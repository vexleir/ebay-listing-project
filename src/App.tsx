import { useState, useEffect } from 'react';
import { PlusCircle, List, Check, AlertTriangle, BarChart2, Settings, ShoppingBag, Shield, DollarSign, Zap, Download } from 'lucide-react';
import './index.css';

import Uploader from './components/Uploader';
import ResultsEditor from './components/ResultsEditor';
import StagedListings from './components/StagedListings';
import ListedProducts from './components/ListedProducts';
import SoldListings from './components/SoldListings';
import Analytics from './components/Analytics';
import SettingsPanel from './components/SettingsPanel';
import SourcingTool from './components/SourcingTool';
import ListingOptimizer from './components/ListingOptimizer';
import AdminPanel from './components/AdminPanel';
import EbayImportTab from './components/EbayImportTab';
import LoginScreen from './components/LoginScreen';
import { generateListing } from './services/ai';
import type { StagedListing } from './types';
import { useToast } from './context/ToastContext';
import './App.css';

const DRAFT_INSTRUCTIONS_KEY = 'draft_instructions';
const DRAFT_GENERATED_KEY = 'draft_generated';

interface CurrentUser {
  id: string;
  companyId: string;
  role: string;
  email: string;
  name: string;
}

function App() {
  const { toast } = useToast();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEbayConnected, setIsEbayConnected] = useState(false);
  // appPassword holds the JWT token; prop name kept for backward compat across all child components
  const [appPassword, setAppPassword] = useState(localStorage.getItem('app_token') || '');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);

  const [images, setImages] = useState<File[]>([]);
  const [instructions, setInstructions] = useState(() => sessionStorage.getItem(DRAFT_INSTRUCTIONS_KEY) || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<{
    title: string; description: string; condition: string;
    itemSpecifics: Record<string, string>; category: string;
    priceRecommendation: string; priceJustification: string; shippingEstimate: string;
  } | null>(() => {
    try { const s = sessionStorage.getItem(DRAFT_GENERATED_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  const [stagedListings, setStagedListings] = useState<StagedListing[]>([]);
  const [activeTab, setActiveTab] = useState<'new' | 'staged' | 'listed' | 'sold' | 'analytics' | 'settings' | 'source' | 'optimizer' | 'admin' | 'ebay-import'>('new');
  const [listedProducts, setListedProducts] = useState<StagedListing[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(false);

  // Draft autosave
  useEffect(() => { sessionStorage.setItem(DRAFT_INSTRUCTIONS_KEY, instructions); }, [instructions]);
  useEffect(() => {
    if (generatedData) sessionStorage.setItem(DRAFT_GENERATED_KEY, JSON.stringify(generatedData));
    else sessionStorage.removeItem(DRAFT_GENERATED_KEY);
  }, [generatedData]);

  // Bearer auth header helper
  const bearerHeaders = (token: string) => ({ 'Authorization': `Bearer ${token}` });
  const apiHeaders = (token: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });

  // Auto-Login: verify stored JWT on mount
  useEffect(() => {
    if (appPassword) {
      fetch('/api/auth/me', { headers: bearerHeaders(appPassword) })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('invalid token');
        })
        .then(data => {
          setCurrentUser(data.user);
          setIsAuthenticated(true);
          loadListings(appPassword);
          fetch('/api/ebay/auth-status', { headers: bearerHeaders(appPassword) })
            .then(r => r.json())
            .then(d => {
              setIsEbayConnected(d.connected);
              if (d.connected) {
                fetch('/api/ebay/token-info', { headers: bearerHeaders(appPassword) })
                  .then(r => r.json())
                  .then(info => setTokenExpiresAt(info.refresh_token_expires_at || null))
                  .catch(() => {});
              }
            })
            .catch(() => {});
        })
        .catch(() => {
          localStorage.removeItem('app_token');
          setAppPassword('');
        })
        .finally(() => setIsVerifying(false));
    } else {
      setIsVerifying(false);
    }
  }, []);

  const handleLogin = (token: string, user: CurrentUser) => {
    localStorage.setItem('app_token', token);
    setAppPassword(token);
    setCurrentUser(user);
    setIsAuthenticated(true);
    loadListings(token);
    fetch('/api/ebay/auth-status', { headers: bearerHeaders(token) })
      .then(r => r.json())
      .then(d => {
        setIsEbayConnected(d.connected);
        if (d.connected) {
          fetch('/api/ebay/token-info', { headers: bearerHeaders(token) })
            .then(r => r.json())
            .then(info => setTokenExpiresAt(info.refresh_token_expires_at || null))
            .catch(() => {});
        }
      })
      .catch(() => {});
  };

  const handleLogout = () => {
    localStorage.removeItem('app_token');
    setAppPassword('');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setStagedListings([]);
    setListedProducts([]);
  };

  const handleEbayConnect = async () => {
    try {
      const resp = await fetch('/api/ebay/auth-url', { headers: bearerHeaders(appPassword) });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
      else if (data.error) toast('eBay Configuration Error: ' + data.error, 'error');
    } catch {
      toast('Error getting eBay login URL. Is the server running?', 'error');
    }
  };

  const handleEbayDisconnect = async () => {
    await fetch('/api/ebay/tokens', { method: 'DELETE', headers: bearerHeaders(appPassword) });
    setIsEbayConnected(false);
    setTokenExpiresAt(null);
    toast('eBay disconnected. Click "Connect to eBay" to reconnect.', 'info');
  };

  // Handle ?ebay=connected / ?ebay=error after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ebayStatus = params.get('ebay');
    if (!ebayStatus) return;
    window.history.replaceState({}, '', '/');
    if (ebayStatus === 'connected') {
      setIsEbayConnected(true);
      toast('eBay connected successfully!', 'success');
      if (appPassword) {
        fetch('/api/ebay/token-info', { headers: bearerHeaders(appPassword) })
          .then(r => r.json())
          .then(info => setTokenExpiresAt(info.refresh_token_expires_at || null))
          .catch(() => {});
      }
    } else if (ebayStatus === 'error') {
      const msg = params.get('msg');
      const decoded = msg ? decodeURIComponent(msg) : 'Unknown error';
      toast(`eBay connection failed: ${decoded}`, 'error');
    }
  }, []);

  const saveImages = (id: string, images: string[]) => {
    const store = JSON.parse(localStorage.getItem('listing_images') || '{}');
    store[id] = images;
    localStorage.setItem('listing_images', JSON.stringify(store));
  };
  const loadImages = (id: string): string[] => {
    return JSON.parse(localStorage.getItem('listing_images') || '{}')[id] || [];
  };
  const removeImages = (id: string) => {
    const store = JSON.parse(localStorage.getItem('listing_images') || '{}');
    delete store[id];
    localStorage.setItem('listing_images', JSON.stringify(store));
  };
  const mergeImages = (listings: StagedListing[]) => listings.map(l => ({
    ...l,
    images: l.images?.length ? l.images : loadImages(l.id)
  }));

  const uploadImagesToCloud = async (base64Images: string[]): Promise<string[]> => {
    if (base64Images.length === 0) return [];
    try {
      const resp = await fetch('/api/images/upload', {
        method: 'POST', headers: apiHeaders(appPassword),
        body: JSON.stringify({ images: base64Images })
      });
      if (!resp.ok) throw new Error(await resp.text());
      return (await resp.json()).urls as string[];
    } catch (e) {
      console.warn('Cloudinary upload failed, falling back to localStorage only:', e);
      return base64Images;
    }
  };

  const loadListings = async (token: string) => {
    setIsLoadingListings(true);
    try {
      const [staged, listed] = await Promise.all([
        fetch('/api/listings?status=staged', { headers: bearerHeaders(token) }).then(r => r.json()),
        fetch('/api/listings?status=listed', { headers: bearerHeaders(token) }).then(r => r.json()),
      ]);
      setStagedListings(Array.isArray(staged) ? mergeImages(staged) : []);
      setListedProducts(Array.isArray(listed) ? mergeImages(listed) : []);
    } catch (e) {
      console.error('Failed to load listings:', e);
    } finally {
      setIsLoadingListings(false);
    }
  };

  const handleStageListing = async (listing: Omit<StagedListing, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    const { images: rawImages, ...meta } = listing as any;
    const base64Images: string[] = (rawImages || []).filter((img: string) => img.startsWith('data:'));
    const existingUrls: string[] = (rawImages || []).filter((img: string) => img.startsWith('http'));
    const uploadedUrls = await uploadImagesToCloud(base64Images);
    const finalImages = [...existingUrls, ...uploadedUrls];
    const now = Date.now();
    const newListing: StagedListing = { ...meta, id, createdAt: now, updatedAt: now, status: 'staged', images: finalImages };
    if (finalImages.some(img => img.startsWith('data:'))) saveImages(id, finalImages);
    setStagedListings(prev => [newListing, ...prev]);
    setImages([]);
    setInstructions('');
    setGeneratedData(null);
    setActiveTab('staged');
    const resp = await fetch('/api/listings', { method: 'POST', headers: apiHeaders(appPassword), body: JSON.stringify({ listing: newListing }) });
    if (!resp.ok) console.error('Failed to save listing to server:', await resp.text());
  };

  const handleUpdateStagedListing = async (updatedListing: StagedListing) => {
    const withTimestamp = { ...updatedListing, updatedAt: Date.now() };
    setStagedListings(prev => prev.map(l => l.id === updatedListing.id ? withTimestamp : l));
    await fetch(`/api/listings/${updatedListing.id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: withTimestamp }) });
  };

  const handleDeleteStagedListing = (id: string) => {
    const listing = stagedListings.find(l => l.id === id);
    if (!listing) return;
    setStagedListings(prev => prev.filter(l => l.id !== id));
    const timer = setTimeout(async () => {
      removeImages(id);
      await fetch(`/api/listings/${id}`, { method: 'DELETE', headers: bearerHeaders(appPassword) });
    }, 5000);
    toast(`"${listing.title.substring(0, 35)}..." deleted.`, 'info', {
      label: 'Undo',
      onClick: () => { clearTimeout(timer); setStagedListings(prev => [listing, ...prev]); }
    });
  };

  const handleBulkDelete = (ids: string[]) => {
    const removed = stagedListings.filter(l => ids.includes(l.id));
    setStagedListings(prev => prev.filter(l => !ids.includes(l.id)));
    const timer = setTimeout(async () => {
      removed.forEach(l => removeImages(l.id));
      await Promise.all(ids.map(id => fetch(`/api/listings/${id}`, { method: 'DELETE', headers: bearerHeaders(appPassword) })));
    }, 5000);
    toast(`${ids.length} listing${ids.length > 1 ? 's' : ''} deleted.`, 'info', {
      label: 'Undo',
      onClick: () => { clearTimeout(timer); setStagedListings(prev => [...removed, ...prev]); }
    });
  };

  const handleMoveToListed = async (listing: StagedListing, draftId: string) => {
    const now = Date.now();
    const listedListing: StagedListing = { ...listing, status: 'listed', ebayDraftId: draftId, updatedAt: now };
    setStagedListings(prev => prev.filter(l => l.id !== listing.id));
    setListedProducts(prev => [listedListing, ...prev]);
    setActiveTab('listed');
    // Single atomic PUT instead of DELETE+POST — avoids race condition where deleteOne
    // could match the newly-created listed doc (both share the same id field).
    await fetch(`/api/listings/${listing.id}`, {
      method: 'PUT',
      headers: apiHeaders(appPassword),
      body: JSON.stringify({ updates: { status: 'listed', ebayDraftId: draftId, updatedAt: now } }),
    });
  };

  const handleDeleteListedListing = (id: string) => {
    const listing = listedProducts.find(l => l.id === id);
    if (!listing) return;
    setListedProducts(prev => prev.filter(l => l.id !== id));
    const timer = setTimeout(async () => {
      removeImages(id);
      await fetch(`/api/listings/${id}`, { method: 'DELETE', headers: bearerHeaders(appPassword) });
    }, 5000);
    toast(`"${listing.title.substring(0, 35)}..." deleted.`, 'info', {
      label: 'Undo',
      onClick: () => { clearTimeout(timer); setListedProducts(prev => [listing, ...prev]); }
    });
  };

  const handleSyncSold = async () => {
    if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; }
    try {
      const resp = await fetch('/api/ebay/sold-items', { headers: bearerHeaders(appPassword) });
      const data = await resp.json();
      if (data.error) { toast('Sync failed: ' + data.error, 'error'); return; }
      const soldItems: { itemId: string; soldPrice: string; soldDate: string }[] = data.items || [];
      if (soldItems.length === 0) { toast('No sold items found in the last 30 days.', 'info'); return; }
      let count = 0;
      setListedProducts(prev => prev.map(l => {
        const match = soldItems.find(s => s.itemId && l.ebayDraftId && s.itemId === l.ebayDraftId);
        if (match && !l.soldAt) { count++; return { ...l, archived: true, soldAt: Date.now(), soldPrice: match.soldPrice, updatedAt: Date.now() }; }
        return l;
      }));
      const updated = listedProducts.filter(l => soldItems.some(s => s.itemId === l.ebayDraftId && !l.soldAt));
      await Promise.all(updated.map(l => {
        const match = soldItems.find(s => s.itemId === l.ebayDraftId)!;
        return fetch(`/api/listings/${l.id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: { archived: true, soldAt: Date.now(), soldPrice: match.soldPrice, updatedAt: Date.now() } }) });
      }));
      if (count > 0) toast(`${count} listing${count > 1 ? 's' : ''} marked as sold!`, 'success');
      else toast('All listings already up to date.', 'info');
    } catch (e: any) {
      toast('Sync error: ' + e.message, 'error');
    }
  };

  const handleRelistListing = async (listing: StagedListing) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const reListing: StagedListing = { ...listing, id, status: 'staged', createdAt: now, updatedAt: now, ebayDraftId: undefined, archived: false, soldAt: undefined, soldPrice: undefined };
    setStagedListings(prev => [reListing, ...prev]);
    setActiveTab('staged');
    const resp = await fetch('/api/listings', { method: 'POST', headers: apiHeaders(appPassword), body: JSON.stringify({ listing: reListing }) });
    if (!resp.ok) console.error('Failed to save relisted listing:', await resp.text());
    toast(`"${listing.title.substring(0, 35)}..." re-staged for relisting.`, 'success');
  };

  const handleArchiveListedListing = async (id: string) => {
    const listing = listedProducts.find(l => l.id === id);
    if (!listing) return;
    const archived = !listing.archived;
    setListedProducts(prev => prev.map(l => l.id === id ? { ...l, archived, updatedAt: Date.now() } : l));
    await fetch(`/api/listings/${id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: { archived, updatedAt: Date.now() } }) });
  };

  const handleMarkSold = async (id: string, soldPrice: string, soldAt: number) => {
    const now = Date.now();
    setListedProducts(prev => prev.map(l => l.id === id ? { ...l, archived: true, soldAt, soldPrice, updatedAt: now } : l));
    await fetch(`/api/listings/${id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: { archived: true, soldAt, soldPrice, updatedAt: now } }) });
  };

  const handleUnmarkSold = async (id: string) => {
    const now = Date.now();
    setListedProducts(prev => prev.map(l => l.id === id ? { ...l, archived: false, soldAt: undefined, soldPrice: undefined, updatedAt: now } : l));
    await fetch(`/api/listings/${id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: { archived: false, soldAt: null, soldPrice: null, updatedAt: now } }) });
  };

  const handleUpdateListing = (updated: StagedListing) => {
    setListedProducts(prev => prev.map(l => l.id === updated.id ? updated : l));
  };

  // Called when EbayImportTab successfully imports listings to the DB.
  // Merges them into listedProducts state and navigates to the Listed tab.
  const handleEbayImported = (imported: StagedListing[]) => {
    setListedProducts(prev => {
      const existingIds = new Set(prev.map(l => l.id));
      const newOnes = imported.filter(l => !existingIds.has(l.id));
      return [...newOnes, ...prev];
    });
    setActiveTab('listed');
  };

  const handleGenerate = async (activeImages: File[], activeInstructions: string) => {
    if (activeImages.length === 0 && !activeInstructions.trim()) {
      toast('Please select at least one image or provide written instructions.', 'error');
      return;
    }
    setIsGenerating(true);
    setGeneratedData(null);
    try {
      const result = await generateListing(activeImages, activeInstructions, appPassword);
      setGeneratedData(result);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const tokenDaysLeft = tokenExpiresAt ? Math.ceil((tokenExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const tokenExpiryColor = tokenDaysLeft !== null
    ? (tokenDaysLeft <= 2 ? '#ef4444' : tokenDaysLeft <= 7 ? '#f59e0b' : 'var(--success)')
    : 'var(--success)';

  const tabBtnStyle = (tab: string): React.CSSProperties => ({
    background: activeTab === tab ? 'var(--glass-bg)' : 'transparent',
    border: '1px solid',
    borderColor: activeTab === tab ? 'var(--glass-border)' : 'transparent',
    color: 'var(--text-primary)',
    padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, transition: 'all 0.2s ease'
  });

  if (isVerifying) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Authenticating...</p></div>;
  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div style={{ minHeight: '100vh', padding: '1rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderRadius: '1rem', border: '1px solid var(--border-color)', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>eB</div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Listing<span className="text-gradient">Stager</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button style={tabBtnStyle('new')} onClick={() => setActiveTab('new')}><PlusCircle size={18} /> New Listing</button>
          <button style={tabBtnStyle('staged')} onClick={() => setActiveTab('staged')}><List size={18} /> Staged ({stagedListings.length})</button>
          <button style={tabBtnStyle('listed')} onClick={() => setActiveTab('listed')}><Check size={18} /> Listed ({listedProducts.filter(l => !l.soldAt).length})</button>
          <button style={{ ...tabBtnStyle('ebay-import'), borderStyle: activeTab === 'ebay-import' ? 'solid' : 'dashed', opacity: activeTab === 'ebay-import' ? 1 : 0.75 }} onClick={() => setActiveTab('ebay-import')}><Download size={18} /> eBay Import</button>
          <button style={tabBtnStyle('sold')} onClick={() => setActiveTab('sold')}><DollarSign size={18} /> Sold ({listedProducts.filter(l => !!l.soldAt).length})</button>
          <button style={tabBtnStyle('analytics')} onClick={() => setActiveTab('analytics')}><BarChart2 size={18} /> Analytics</button>
          <button style={tabBtnStyle('source')} onClick={() => setActiveTab('source')}><ShoppingBag size={18} /> Source</button>
          <button style={tabBtnStyle('optimizer')} onClick={() => setActiveTab('optimizer')}><Zap size={18} /> Optimizer</button>
          {currentUser?.role === 'superadmin' && (
            <button style={tabBtnStyle('admin')} onClick={() => setActiveTab('admin')}><Shield size={18} /> Admin</button>
          )}
          <button style={tabBtnStyle('settings')} onClick={() => setActiveTab('settings')}><Settings size={18} /> Settings</button>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isEbayConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{ color: tokenExpiryColor, fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {tokenDaysLeft !== null && tokenDaysLeft <= 7 && <AlertTriangle size={14} />}
                <Check size={16} /> eBay: Connected
              </span>
              {tokenDaysLeft !== null && (
                <span style={{ fontSize: '0.72rem', color: tokenExpiryColor, opacity: 0.85 }}>Token expires in {tokenDaysLeft}d</span>
              )}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn-icon" onClick={handleEbayConnect} style={{ fontSize: '0.68rem', padding: '1px 6px', opacity: 0.6 }}>
                  Reconnect
                </button>
                <button className="btn-icon" onClick={handleEbayDisconnect} style={{ fontSize: '0.68rem', padding: '1px 6px', opacity: 0.6, color: '#ef4444' }}>
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-primary" onClick={handleEbayConnect} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
              Connect to eBay
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{currentUser?.name}</span>
            <button className="btn-icon" onClick={handleLogout} title="Logout" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main style={{ padding: '0 1rem 2rem 1rem', flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {isLoadingListings ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading listings...</div>
        ) : activeTab === 'new' ? (
          <div className="animate-fade-in" style={{ display: 'grid', gap: '2rem', gridTemplateColumns: generatedData ? 'minmax(400px, 1fr) minmax(600px, 1.8fr)' : 'max-content', justifyContent: 'center' }}>
            <div style={{ width: generatedData ? '100%' : '600px', maxWidth: '100%', margin: generatedData ? '0' : '0 auto' }}>
              <Uploader images={images} setImages={setImages} instructions={instructions} setInstructions={setInstructions} onGenerate={handleGenerate} isGenerating={isGenerating} disabled={false} appPassword={appPassword} />
            </div>
            {generatedData && (
              <div className="animate-fade-in">
                <ResultsEditor data={generatedData} images={images} onStage={handleStageListing} onCancel={() => setGeneratedData(null)} appPassword={appPassword} />
              </div>
            )}
          </div>
        ) : activeTab === 'staged' ? (
          <div className="animate-fade-in">
            <StagedListings listings={stagedListings} onUpdate={handleUpdateStagedListing} onDelete={handleDeleteStagedListing} onBulkDelete={handleBulkDelete} onMoveToListed={handleMoveToListed} isEbayConnected={isEbayConnected} appPassword={appPassword} />
          </div>
        ) : activeTab === 'listed' ? (
          <div className="animate-fade-in">
            <ListedProducts listings={listedProducts} onDelete={handleDeleteListedListing} onArchive={handleArchiveListedListing} onSyncSold={handleSyncSold} onRelist={handleRelistListing} onMarkSold={handleMarkSold} onUpdateListing={handleUpdateListing} isEbayConnected={isEbayConnected} appPassword={appPassword} />
          </div>
        ) : activeTab === 'sold' ? (
          <div className="animate-fade-in">
            <SoldListings listings={listedProducts.filter(l => !!l.soldAt)} onDelete={handleDeleteListedListing} onUnmarkSold={handleUnmarkSold} onRelist={handleRelistListing} />
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="animate-fade-in">
            <Analytics staged={stagedListings} listed={listedProducts} appPassword={appPassword} />
          </div>
        ) : activeTab === 'source' ? (
          <div className="animate-fade-in">
            <SourcingTool appPassword={appPassword} listed={listedProducts} />
          </div>
        ) : activeTab === 'optimizer' ? (
          <div className="animate-fade-in">
            <ListingOptimizer appPassword={appPassword} />
          </div>
        ) : activeTab === 'ebay-import' ? (
          <div className="animate-fade-in">
            <EbayImportTab appPassword={appPassword} isEbayConnected={isEbayConnected} onImported={handleEbayImported} />
          </div>
        ) : activeTab === 'admin' && currentUser?.role === 'superadmin' ? (
          <div className="animate-fade-in">
            <AdminPanel appPassword={appPassword} />
          </div>
        ) : (
          <div className="animate-fade-in">
            <SettingsPanel appPassword={appPassword} isEbayConnected={isEbayConnected} staged={stagedListings} listed={listedProducts} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
