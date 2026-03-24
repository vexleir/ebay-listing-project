import { useState, useEffect } from 'react';
import { PlusCircle, List, Check } from 'lucide-react';
import './index.css';

// We will create these components next
import Uploader from './components/Uploader';
import ResultsEditor from './components/ResultsEditor';
import StagedListings from './components/StagedListings';
import ListedProducts from './components/ListedProducts';
import LoginScreen from './components/LoginScreen';
import { generateListing } from './services/ai';
import type { StagedListing } from './types';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEbayConnected, setIsEbayConnected] = useState(false);
  const [appPassword, setAppPassword] = useState(localStorage.getItem('app_password') || '');
  const [isVerifying, setIsVerifying] = useState(true);

  const [images, setImages] = useState<File[]>([]);
  const [instructions, setInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<{
    title: string;
    description: string;
    condition: string;
    itemSpecifics: Record<string, string>;
    category: string;
    priceRecommendation: string;
    priceJustification: string;
    shippingEstimate: string;
  } | null>(null);
  
  const [stagedListings, setStagedListings] = useState<StagedListing[]>([]);
  const [activeTab, setActiveTab] = useState<'new' | 'staged' | 'listed'>('new');
  const [listedProducts, setListedProducts] = useState<StagedListing[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(false);

  // Auto-Login Verification
  useEffect(() => {
    if (appPassword) {
      fetch('/api/verify-password', {
        headers: { 'x-app-password': appPassword }
      })
      .then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
          loadListings(appPassword);
          // Check eBay auth status
          fetch('/api/ebay/auth-status', {
            headers: { 'x-app-password': appPassword }
          })
            .then(r => r.json())
            .then(data => setIsEbayConnected(data.connected))
            .catch(e => console.error("Error checking eBay auth:", e));
        } else {
          setAppPassword('');
        }
        setIsVerifying(false);
      })
      .catch(() => setIsVerifying(false));
    } else {
      setIsVerifying(false);
    }
  }, [appPassword]);

  const handleEbayConnect = async () => {
    try {
      const resp = await fetch('/api/ebay/auth-url', {
        headers: { 'x-app-password': appPassword }
      });
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert("eBay Configuration Error: " + data.error);
      }
    } catch (e) {
      alert("Error getting eBay login URL. Is the server running?");
    }
  };

  const apiHeaders = (pw: string) => ({
    'Content-Type': 'application/json',
    'x-app-password': pw
  });

  const migrateFromLocalStorage = async (pw: string) => {
    const localStaged: StagedListing[] = JSON.parse(localStorage.getItem('staged_ebay_listings') || '[]');
    const localListed: StagedListing[] = JSON.parse(localStorage.getItem('listed_ebay_listings') || '[]');
    if (localStaged.length === 0 && localListed.length === 0) return;

    const [serverStaged, serverListed] = await Promise.all([
      fetch('/api/listings?status=staged', { headers: { 'x-app-password': pw } }).then(r => r.json()),
      fetch('/api/listings?status=listed', { headers: { 'x-app-password': pw } }).then(r => r.json()),
    ]);
    const serverIds = new Set([
      ...(Array.isArray(serverStaged) ? serverStaged : []).map((l: StagedListing) => l.id),
      ...(Array.isArray(serverListed) ? serverListed : []).map((l: StagedListing) => l.id),
    ]);

    const toUpload = [
      ...localStaged.filter(l => !serverIds.has(l.id)).map(l => ({ ...l, status: 'staged' as const })),
      ...localListed.filter(l => !serverIds.has(l.id)).map(l => ({ ...l, status: 'listed' as const })),
    ];

    if (toUpload.length > 0) {
      console.log(`Migrating ${toUpload.length} listings from localStorage to server...`);
      await Promise.all(toUpload.map(listing =>
        fetch('/api/listings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-password': pw }, body: JSON.stringify({ listing }) })
      ));
      localStorage.removeItem('staged_ebay_listings');
      localStorage.removeItem('listed_ebay_listings');
      console.log('Migration complete.');
    }
  };

  const loadListings = async (pw: string) => {
    setIsLoadingListings(true);
    try {
      await migrateFromLocalStorage(pw).catch(e => console.warn('Migration failed (non-fatal):', e));
      const [staged, listed] = await Promise.all([
        fetch('/api/listings?status=staged', { headers: { 'x-app-password': pw } }).then(r => r.json()),
        fetch('/api/listings?status=listed', { headers: { 'x-app-password': pw } }).then(r => r.json()),
      ]);
      console.log(`Loaded ${staged?.length ?? 0} staged, ${listed?.length ?? 0} listed from server`);
      setStagedListings(Array.isArray(staged) ? staged : []);
      setListedProducts(Array.isArray(listed) ? listed : []);
    } catch (e) {
      console.error('Failed to load listings:', e);
    } finally {
      setIsLoadingListings(false);
    }
  };

  const handleStageListing = async (listing: Omit<StagedListing, 'id' | 'createdAt'>) => {
    const newListing: StagedListing = { ...listing, id: crypto.randomUUID(), createdAt: Date.now(), status: 'staged' } as StagedListing;
    setStagedListings(prev => [newListing, ...prev]);
    setImages([]);
    setInstructions('');
    setGeneratedData(null);
    setActiveTab('staged');
    const resp = await fetch('/api/listings', { method: 'POST', headers: apiHeaders(appPassword), body: JSON.stringify({ listing: newListing }) });
    if (!resp.ok) console.error('Failed to save listing to server:', await resp.text());
  };

  const handleUpdateStagedListing = async (updatedListing: StagedListing) => {
    setStagedListings(prev => prev.map(l => l.id === updatedListing.id ? updatedListing : l));
    await fetch(`/api/listings/${updatedListing.id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: updatedListing }) });
  };

  const handleDeleteStagedListing = async (id: string) => {
    setStagedListings(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/listings/${id}`, { method: 'DELETE', headers: { 'x-app-password': appPassword } });
  };

  const handleMoveToListed = async (listing: StagedListing, draftId: string) => {
    const listedListing: StagedListing = { ...listing, status: 'listed', ebayDraftId: draftId } as StagedListing;
    setStagedListings(prev => prev.filter(l => l.id !== listing.id));
    setListedProducts(prev => [listedListing, ...prev]);
    setActiveTab('listed');
    await Promise.all([
      fetch(`/api/listings/${listing.id}`, { method: 'DELETE', headers: { 'x-app-password': appPassword } }),
      fetch('/api/listings', { method: 'POST', headers: apiHeaders(appPassword), body: JSON.stringify({ listing: listedListing }) }),
    ]);
  };

  const handleDeleteListedListing = async (id: string) => {
    setListedProducts(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/listings/${id}`, { method: 'DELETE', headers: { 'x-app-password': appPassword } });
  };

  const handleArchiveListedListing = async (id: string) => {
    const listing = listedProducts.find(l => l.id === id);
    if (!listing) return;
    const archived = !listing.archived;
    setListedProducts(prev => prev.map(l => l.id === id ? { ...l, archived } : l));
    await fetch(`/api/listings/${id}`, { method: 'PUT', headers: apiHeaders(appPassword), body: JSON.stringify({ updates: { archived } }) });
  };

  const handleGenerate = async (activeImages: File[], activeInstructions: string) => {
    if (activeImages.length === 0 && !activeInstructions.trim()) {
      alert("Please either add some images or provide instructions to generate a listing.");
      return;
    }
    
    setIsGenerating(true);
    setGeneratedData(null);
    try {
      const result = await generateListing(activeImages, activeInstructions, appPassword);
      setGeneratedData(result);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isVerifying) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Authenticating...</p></div>;

  if (!isAuthenticated) {
    return <LoginScreen setAuthenticated={(pw) => { localStorage.setItem('app_password', pw); setAppPassword(pw); setIsAuthenticated(true); }} />;
  }

  return (
    <div style={{ minHeight: '100vh', padding: '1rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderRadius: '1rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
            eB
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Listing<span className="text-gradient">Stager</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
            style={{
              background: activeTab === 'new' ? 'var(--glass-bg)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'new' ? 'var(--glass-border)' : 'transparent',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
          >
            <PlusCircle size={18} /> New Listing
          </button>
          <button 
            className={`tab-btn ${activeTab === 'staged' ? 'active' : ''}`}
            onClick={() => setActiveTab('staged')}
            style={{
              background: activeTab === 'staged' ? 'var(--glass-bg)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'staged' ? 'var(--glass-border)' : 'transparent',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
          >
            <List size={18} /> Staged ({stagedListings.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'listed' ? 'active' : ''}`}
            onClick={() => setActiveTab('listed')}
            style={{
              background: activeTab === 'listed' ? 'var(--glass-bg)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'listed' ? 'var(--glass-border)' : 'transparent',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
          >
            <Check size={18} /> Listed ({listedProducts.length})
          </button>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isEbayConnected ? (
            <span style={{ color: 'var(--success)', fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Check size={16} /> eBay: Connected
            </span>
          ) : (
            <button className="btn-primary" onClick={handleEbayConnect} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
              Connect to eBay
            </button>
          )}
          <button className="btn-icon" onClick={() => { localStorage.removeItem('app_password'); setIsAuthenticated(false); }} title="Logout">
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ padding: '0 1rem 2rem 1rem', flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {isLoadingListings ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading listings...</div>
        ) : activeTab === 'new' ? (
          <div className="animate-fade-in" style={{ display: 'grid', gap: '2rem', gridTemplateColumns: generatedData ? 'minmax(400px, 1fr) minmax(600px, 1.8fr)' : 'max-content', justifyContent: 'center' }}>
            <div style={{ width: generatedData ? '100%' : '600px', maxWidth: '100%', margin: generatedData ? '0' : '0 auto' }}>
              <Uploader 
                images={images}
                setImages={setImages}
                instructions={instructions}
                setInstructions={setInstructions}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                disabled={false}
              />
            </div>
            
            {generatedData && (
              <div className="animate-fade-in">
                <ResultsEditor 
                  data={generatedData} 
                  images={images}
                  onStage={handleStageListing}
                  onCancel={() => setGeneratedData(null)}
                />
              </div>
            )}
          </div>
        ) : activeTab === 'staged' ? (
          <div className="animate-fade-in">
            <StagedListings
              listings={stagedListings}
              onUpdate={handleUpdateStagedListing}
              onDelete={handleDeleteStagedListing}
              onMoveToListed={handleMoveToListed}
              isEbayConnected={isEbayConnected}
            />
          </div>
        ) : (
          <div className="animate-fade-in">
            <ListedProducts
              listings={listedProducts}
              onDelete={handleDeleteListedListing}
              onArchive={handleArchiveListedListing}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
