import { useState, useEffect } from 'react';
import { PlusCircle, List, Check, AlertTriangle, BarChart2, Settings, Shield, DollarSign, Zap, Download, ChevronLeft, ChevronRight, Layers, HelpCircle, MessageSquare, Menu, X, Package } from 'lucide-react';
import './index.css';
import { useIsMobile } from './hooks/useMediaQuery';

import Uploader from './components/Uploader';
import BulkUploader from './components/BulkUploader';
import ResultsEditor from './components/ResultsEditor';
import StagedListings from './components/StagedListings';
import ListedProducts from './components/ListedProducts';
import SoldListings from './components/SoldListings';
import Analytics from './components/Analytics';
import SettingsPanel from './components/SettingsPanel';
import ListingOptimizer from './components/ListingOptimizer';
import AdminPanel from './components/AdminPanel';
import EbayImportTab from './components/EbayImportTab';
import HelpPage from './components/HelpPage';
import Feedback from './components/Feedback';
import LoginScreen from './components/LoginScreen';
import ConfirmDialog from './components/ConfirmDialog';
import ContainerManagement from './components/containers/ContainerManagement';
import ErrorBoundary from './components/ErrorBoundary';
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
    tags?: string[]; seoKeywords?: string;
  } | null>(() => {
    try { const s = sessionStorage.getItem(DRAFT_GENERATED_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  const [stagedListings, setStagedListings] = useState<StagedListing[]>([]);
  const [activeTab, setActiveTab] = useState<'new' | 'bulk' | 'staged' | 'listed' | 'sold' | 'analytics' | 'settings' | 'optimizer' | 'admin' | 'ebay-import' | 'help' | 'feedback' | 'containers'>('new');
  const [listedProducts, setListedProducts] = useState<StagedListing[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('sidebar_collapsed') === '1');
  // MOB-001a — separate "is the mobile drawer open" from the desktop collapse
  // state. Desktop ignores `mobileSidebarOpen`; mobile ignores `sidebarCollapsed`.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => { localStorage.setItem('sidebar_collapsed', sidebarCollapsed ? '1' : '0'); }, [sidebarCollapsed]);

  // Auto-close the mobile drawer when the viewport grows past the breakpoint,
  // and on every tab change so the user isn't left with a covering sidebar.
  useEffect(() => { if (!isMobile && mobileSidebarOpen) setMobileSidebarOpen(false); }, [isMobile, mobileSidebarOpen]);

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

  // UX-001 — Disconnect is destructive (it deletes stored OAuth tokens, so
  // the seller has to redo the eBay consent flow). Gate it behind a confirm
  // dialog instead of firing immediately on click.
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const openDisconnectConfirm = () => setDisconnectConfirmOpen(true);
  const cancelDisconnect = () => { if (!disconnecting) setDisconnectConfirmOpen(false); };

  const handleEbayDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/ebay/tokens', { method: 'DELETE', headers: bearerHeaders(appPassword) });
      setIsEbayConnected(false);
      setTokenExpiresAt(null);
      toast('eBay disconnected. Click "Connect to eBay" to reconnect.', 'info');
    } finally {
      setDisconnecting(false);
      setDisconnectConfirmOpen(false);
    }
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

  const stageListingCore = async (listing: Omit<StagedListing, 'id' | 'createdAt'>) => {
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
    const resp = await fetch('/api/listings', { method: 'POST', headers: apiHeaders(appPassword), body: JSON.stringify({ listing: newListing }) });
    if (!resp.ok) console.error('Failed to save listing to server:', await resp.text());
  };

  const handleStageListing = async (listing: Omit<StagedListing, 'id' | 'createdAt'>) => {
    await stageListingCore(listing);
    setImages([]);
    setInstructions('');
    setGeneratedData(null);
    setActiveTab('staged');
  };

  // Bulk variant: stages without clearing single-uploader state or switching tabs mid-loop.
  // BulkUploader stays mounted so its per-group "Staged" badges render as each one completes.
  const handleBulkStageListing = async (listing: Omit<StagedListing, 'id' | 'createdAt'>) => {
    await stageListingCore(listing);
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

  const handleSyncSold = async (silent = false) => {
    if (!isEbayConnected) { if (!silent) toast('Connect to eBay first.', 'error'); return; }
    try {
      const resp = await fetch('/api/ebay/sold-items', { headers: bearerHeaders(appPassword) });
      const data = await resp.json();
      if (data.error) { if (!silent) toast('Sync failed: ' + data.error, 'error'); return; }
      const soldItems: { itemId: string; soldPrice: string; soldDate: string }[] = data.items || [];
      if (soldItems.length === 0) { if (!silent) toast('No sold items found in the last 30 days.', 'info'); return; }
      let count = 0;
      setListedProducts(prev => prev.map(l => {
        const match = soldItems.find(s => s.itemId && l.ebayDraftId && s.itemId === l.ebayDraftId);
        if (match && !l.soldAt) { count++; return { ...l, archived: true, soldAt: Date.now(), soldPrice: match.soldPrice, updatedAt: Date.now() }; }
        return l;
      }));
      const updated = listedProducts.filter(l => soldItems.some(s => s.itemId === l.ebayDraftId && !l.soldAt));
      await Promise.all(updated.map(async l => {
        const match = soldItems.find(s => s.itemId === l.ebayDraftId)!;
        await fetch(`/api/listings/${l.id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: { archived: true, soldAt: Date.now(), soldPrice: match.soldPrice, updatedAt: Date.now() } }) });
      }));
      if (count > 0) toast(`${count} listing${count > 1 ? 's' : ''} marked as sold!`, 'success');
      else if (!silent) toast('All listings already up to date.', 'info');
    } catch (e: any) {
      if (!silent) toast('Sync error: ' + e.message, 'error');
    }
  };

  // Auto-sync sold listings every 30 minutes when eBay is connected
  useEffect(() => {
    if (!isEbayConnected || !isAuthenticated) return;
    const INTERVAL_MS = 30 * 60 * 1000;
    const id = setInterval(() => handleSyncSold(true), INTERVAL_MS);
    return () => clearInterval(id);
  }, [isEbayConnected, isAuthenticated, appPassword]);

  // Moves a Listed record back to Staged in place — same id, clears eBay-specific fields.
  // Used when a listing was deleted on eBay and needs to be pushed again from our DB.
  const handleMoveToStaged = async (listing: StagedListing) => {
    const now = Date.now();
    const moved: StagedListing = {
      ...listing,
      status: 'staged',
      ebayDraftId: undefined,
      archived: false,
      soldAt: undefined,
      soldPrice: undefined,
      updatedAt: now,
    };
    setListedProducts(prev => prev.filter(l => l.id !== listing.id));
    setStagedListings(prev => [moved, ...prev]);
    setActiveTab('staged');
    await fetch(`/api/listings/${listing.id}`, {
      method: 'PUT',
      headers: apiHeaders(appPassword),
      body: JSON.stringify({
        updates: {
          status: 'staged',
          ebayDraftId: null,
          archived: false,
          soldAt: null,
          soldPrice: null,
          soldPlatform: null,
          updatedAt: now,
        },
      }),
    });
    toast(`"${listing.title.substring(0, 35)}..." moved back to Staged.`, 'success');
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

  // Delist + relist on eBay in one shot. Ends the current eBay item and
  // immediately pushes a fresh one with the same (or updated) data — no
  // scheduling. Stays on the Listings tab; updates the row's eBay ID in place.
  const handleDelistAndRelist = async (listing: StagedListing, options?: { allowOffers?: boolean }): Promise<{ newDraftId: string } | null> => {
    if (!listing.ebayDraftId) {
      toast('Listing has no eBay item ID to delist.', 'error');
      return null;
    }
    const allowOffers = options?.allowOffers ?? true;
    const resp = await fetch('/api/ebay/relist', {
      method: 'POST',
      headers: apiHeaders(appPassword),
      body: JSON.stringify({
        oldItemId: listing.ebayDraftId,
        listingId: listing.id,
        listing,
        overrideConditionId: undefined,
        bestOffer: { enabled: allowOffers },
      }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      toast('Delist & relist failed: ' + (data.error || resp.statusText), 'error');
      return null;
    }
    const newDraftId: string = data.draftId;
    const now = Date.now();
    setListedProducts(prev => prev.map(l => l.id === listing.id ? { ...l, ebayDraftId: newDraftId, updatedAt: now } : l));
    toast(`"${listing.title.substring(0, 35)}..." delisted and relisted on eBay.`, 'success');
    return { newDraftId };
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

  // INV-002 (lite) — combined active pool for duplicate-SKU detection.
  // The utility filters out sold rows internally, so we just concat.
  const allListings = [...stagedListings, ...listedProducts];

  const tokenDaysLeft = tokenExpiresAt ? Math.ceil((tokenExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const tokenExpiryColor = tokenDaysLeft !== null
    ? (tokenDaysLeft <= 2 ? '#ef4444' : tokenDaysLeft <= 7 ? '#f59e0b' : 'var(--success)')
    : 'var(--success)';

  // On mobile, the drawer always renders in its full-width form regardless of
  // the desktop collapse preference — collapsing a 260px drawer would defeat
  // the purpose of opening it.
  const sidebarCollapsedEffective = !isMobile && sidebarCollapsed;

  const sidebarBtnStyle = (tab: string): React.CSSProperties => ({
    background: activeTab === tab ? 'var(--glass-bg)' : 'transparent',
    border: '1px solid',
    borderColor: activeTab === tab ? 'var(--glass-border)' : 'transparent',
    color: 'var(--text-primary)',
    padding: sidebarCollapsedEffective ? '10px 0' : '10px 12px',
    borderRadius: '8px', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
    justifyContent: sidebarCollapsedEffective ? 'center' : 'flex-start',
    gap: '10px', fontWeight: 500, fontSize: '0.9rem',
    transition: 'all 0.2s ease',
    width: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  });

  const sidebarWidth = sidebarCollapsedEffective ? 64 : 220;

  // Tab nav helper that also auto-closes the mobile drawer.
  const switchTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (isMobile) setMobileSidebarOpen(false);
  };

  if (isVerifying) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Authenticating...</p></div>;
  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;

  const sidebarLabel = (text: string) => sidebarCollapsedEffective ? null : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Mobile backdrop — only renders/visible at <768px; tap to close drawer. */}
      <div
        className={`app-sidebar-backdrop${mobileSidebarOpen ? ' is-visible' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar — same DOM on desktop and mobile; the class drives the
          mobile-drawer behavior via index.css. The inline `--sidebar-width`
          variable lets the desktop collapse animation use the same class. */}
      <aside
        className={`app-sidebar${mobileSidebarOpen ? ' is-open' : ''}`}
        style={{ ['--sidebar-width' as any]: `${sidebarWidth}px` } as React.CSSProperties}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: sidebarCollapsedEffective ? '0.5rem 0' : '0.5rem 0.6rem', justifyContent: sidebarCollapsedEffective ? 'center' : 'flex-start', marginBottom: '1rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem', flexShrink: 0 }}>eB</div>
          {!sidebarCollapsedEffective && <h1 style={{ margin: 0, fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden' }}>Listing<span className="text-gradient">Stager</span></h1>}
          {/* Close-drawer button — mobile only. */}
          {isMobile && (
            <button
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close navigation"
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <button title="New Listing" style={sidebarBtnStyle('new')} onClick={() => switchTab('new')}><PlusCircle size={18} />{sidebarLabel('New Listing')}</button>
          <button title="Bulk Create" style={sidebarBtnStyle('bulk')} onClick={() => switchTab('bulk')}><Layers size={18} />{sidebarLabel('Bulk Create')}</button>
          <button title="Staged" style={sidebarBtnStyle('staged')} onClick={() => switchTab('staged')}><List size={18} />{sidebarLabel(`Staged (${stagedListings.length})`)}</button>
          <button title="Listed" style={sidebarBtnStyle('listed')} onClick={() => switchTab('listed')}><Check size={18} />{sidebarLabel(`Listed (${listedProducts.filter(l => !l.soldAt).length})`)}</button>
          <button title="eBay Import" style={{ ...sidebarBtnStyle('ebay-import'), borderStyle: activeTab === 'ebay-import' ? 'solid' : 'dashed', opacity: activeTab === 'ebay-import' ? 1 : 0.75 }} onClick={() => switchTab('ebay-import')}><Download size={18} />{sidebarLabel('eBay Import')}</button>
          <button title="Sold" style={sidebarBtnStyle('sold')} onClick={() => switchTab('sold')}><DollarSign size={18} />{sidebarLabel(`Sold (${listedProducts.filter(l => !!l.soldAt).length})`)}</button>
          <button title="Analytics" style={sidebarBtnStyle('analytics')} onClick={() => switchTab('analytics')}><BarChart2 size={18} />{sidebarLabel('Analytics')}</button>
          <button title="Optimizer" style={sidebarBtnStyle('optimizer')} onClick={() => switchTab('optimizer')}><Zap size={18} />{sidebarLabel('Optimizer')}</button>
          <button title="Containers" style={sidebarBtnStyle('containers')} onClick={() => switchTab('containers')}><Package size={18} />{sidebarLabel('Containers')}</button>
          {currentUser?.role === 'superadmin' && (
            <button title="Admin" style={sidebarBtnStyle('admin')} onClick={() => switchTab('admin')}><Shield size={18} />{sidebarLabel('Admin')}</button>
          )}
          <button title="Settings" style={sidebarBtnStyle('settings')} onClick={() => switchTab('settings')}><Settings size={18} />{sidebarLabel('Settings')}</button>
        </div>

        {/* Feedback + Help — pinned just above collapse toggle */}
        <button title="Feedback" style={{ ...sidebarBtnStyle('feedback'), marginTop: '0.5rem' }} onClick={() => switchTab('feedback')}>
          <MessageSquare size={18} />{sidebarLabel('Feedback')}
        </button>
        <button title="Help" style={sidebarBtnStyle('help')} onClick={() => switchTab('help')}>
          <HelpCircle size={18} />{sidebarLabel('Help')}
        </button>

        {/* Collapse toggle — hidden on mobile (drawer is full-width). */}
        {!isMobile && (
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              marginTop: '0.5rem',
              background: 'transparent', border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '8px', borderRadius: '8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '8px', fontSize: '0.8rem',
            }}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} />{sidebarLabel('Collapse')}</>}
          </button>
        )}
      </aside>

      {/* Main column (topbar + content) */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1.5rem', gap: '1rem',
          background: 'var(--glass-bg)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
        }}>
          {/* Hamburger — mobile-only; opens the sidebar drawer. */}
          <button
            className="app-hamburger"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileSidebarOpen}
          >
            <Menu size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                <button
                  className="btn-icon"
                  onClick={openDisconnectConfirm}
                  aria-label="Disconnect eBay (asks for confirmation)"
                  style={{ fontSize: '0.68rem', padding: '1px 6px', opacity: 0.6, color: '#ef4444' }}
                >
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
        </header>

      <main className="app-main">
        <ErrorBoundary area={`the ${activeTab} view`} resetKey={activeTab}>
        {isLoadingListings ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading listings...</div>
        ) : activeTab === 'new' ? (
          // MOB-001a — `.new-listing-grid` handles the desktop two-column
          // layout, the single-column fallback, and the <1024px collapse.
          // Width is no longer hardcoded to 600px on the uploader column.
          <div className={`animate-fade-in new-listing-grid${generatedData ? ' has-results' : ''}`}>
            <div style={{ width: '100%', maxWidth: '600px', margin: generatedData ? '0' : '0 auto' }}>
              <Uploader images={images} setImages={setImages} instructions={instructions} setInstructions={setInstructions} onGenerate={handleGenerate} isGenerating={isGenerating} disabled={false} appPassword={appPassword} />
            </div>
            {generatedData && (
              <div className="animate-fade-in">
                <ResultsEditor data={generatedData} images={images} allListings={allListings} onStage={handleStageListing} onCancel={() => setGeneratedData(null)} appPassword={appPassword} />
              </div>
            )}
          </div>
        ) : activeTab === 'bulk' ? (
          <div className="animate-fade-in">
            <BulkUploader onStage={handleBulkStageListing} appPassword={appPassword} />
          </div>
        ) : activeTab === 'staged' ? (
          <div className="animate-fade-in">
            <StagedListings listings={stagedListings} allListings={allListings} onUpdate={handleUpdateStagedListing} onDelete={handleDeleteStagedListing} onBulkDelete={handleBulkDelete} onMoveToListed={handleMoveToListed} isEbayConnected={isEbayConnected} appPassword={appPassword} />
          </div>
        ) : activeTab === 'listed' ? (
          <div className="animate-fade-in">
            <ListedProducts listings={listedProducts} allListings={allListings} onDelete={handleDeleteListedListing} onArchive={handleArchiveListedListing} onSyncSold={handleSyncSold} onRelist={handleRelistListing} onDelistRelist={handleDelistAndRelist} onMoveToStaged={handleMoveToStaged} onMarkSold={handleMarkSold} onUpdateListing={handleUpdateListing} isEbayConnected={isEbayConnected} appPassword={appPassword} />
          </div>
        ) : activeTab === 'sold' ? (
          <div className="animate-fade-in">
            <SoldListings listings={listedProducts.filter(l => !!l.soldAt)} onDelete={handleDeleteListedListing} onUnmarkSold={handleUnmarkSold} onRelist={handleRelistListing} />
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="animate-fade-in">
            <Analytics staged={stagedListings} listed={listedProducts} appPassword={appPassword} />
          </div>
        ) : activeTab === 'optimizer' ? (
          <div className="animate-fade-in">
            <ListingOptimizer appPassword={appPassword} />
          </div>
        ) : activeTab === 'ebay-import' ? (
          <div className="animate-fade-in">
            <EbayImportTab
              appPassword={appPassword}
              isEbayConnected={isEbayConnected}
              onImported={handleEbayImported}
              existingEbayIds={new Set(listedProducts.map(l => l.ebayDraftId).filter((id): id is string => !!id))}
            />
          </div>
        ) : activeTab === 'containers' ? (
          <div className="animate-fade-in">
            <ContainerManagement appPassword={appPassword} />
          </div>
        ) : activeTab === 'admin' && currentUser?.role === 'superadmin' ? (
          <div className="animate-fade-in">
            <AdminPanel appPassword={appPassword} />
          </div>
        ) : activeTab === 'feedback' ? (
          <div className="animate-fade-in">
            <Feedback
              appPassword={appPassword}
              currentUserId={currentUser?.id || ''}
              isSuperAdmin={currentUser?.role === 'superadmin'}
            />
          </div>
        ) : activeTab === 'help' ? (
          <div className="animate-fade-in">
            <HelpPage />
          </div>
        ) : (
          <div className="animate-fade-in">
            <SettingsPanel appPassword={appPassword} isEbayConnected={isEbayConnected} staged={stagedListings} listed={listedProducts} />
          </div>
        )}
        </ErrorBoundary>
      </main>
      </div>

      {/* UX-001 — Disconnect-from-eBay confirmation. Mounted at the top of
          the render tree so the backdrop overlays everything below. */}
      <ConfirmDialog
        open={disconnectConfirmOpen}
        title="Disconnect from eBay?"
        message={
          'This deletes your stored eBay OAuth tokens. You will need to re-authorize ' +
          'in the eBay consent flow before you can push, revise, or sync listings again. ' +
          'No listings are deleted.'
        }
        confirmLabel="Disconnect"
        cancelLabel="Keep connected"
        destructive
        busy={disconnecting}
        onConfirm={handleEbayDisconnect}
        onCancel={cancelDisconnect}
      />
    </div>
  );
}

export default App;
