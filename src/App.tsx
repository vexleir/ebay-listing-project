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
    shippingEstimate: string;
  } | null>(null);
  
  const [stagedListings, setStagedListings] = useState<StagedListing[]>([]);
  // App State continued
  const [activeTab, setActiveTab] = useState<'new' | 'staged' | 'listed'>('new');
  const [listedProducts, setListedProducts] = useState<StagedListing[]>([]);

  // Auto-Login Verification
  useEffect(() => {
    if (appPassword) {
      fetch('/api/verify-password', {
        headers: { 'x-app-password': appPassword }
      })
      .then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
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

  useEffect(() => {
    const savedListings = localStorage.getItem('staged_ebay_listings');
    if (savedListings) {
      try {
        setStagedListings(JSON.parse(savedListings));
      } catch (e) {
        console.error('Failed to parse saved listings');
      }
    }

    const savedPushed = localStorage.getItem('listed_ebay_listings');
    if (savedPushed) {
      try {
        setListedProducts(JSON.parse(savedPushed));
      } catch (e) {
        console.error('Failed to parse listed listings');
      }
    }
  }, []);

  const saveStagedListings = (listings: StagedListing[]) => {
    setStagedListings(listings);
    localStorage.setItem('staged_ebay_listings', JSON.stringify(listings));
  };

  const handleStageListing = async (listing: Omit<StagedListing, 'id' | 'createdAt'>) => {
    const newListing: StagedListing = {
      ...listing,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    
    const updated = [newListing, ...stagedListings];
    saveStagedListings(updated);
    
    // Reset form and switch tab
    setImages([]);
    setInstructions('');
    setGeneratedData(null);
    setActiveTab('staged');
  };

  const handleUpdateStagedListing = (updatedListing: StagedListing) => {
    const updated = stagedListings.map(l => l.id === updatedListing.id ? updatedListing : l);
    saveStagedListings(updated);
  };

  const handleDeleteStagedListing = (id: string) => {
    const updated = stagedListings.filter(l => l.id !== id);
    saveStagedListings(updated);
  };

  const saveListedProducts = (items: StagedListing[]) => {
    setListedProducts(items);
    localStorage.setItem('listed_ebay_listings', JSON.stringify(items));
  };

  const handleMoveToListed = (listing: StagedListing, draftId: string) => {
    const updated = stagedListings.filter(l => l.id !== listing.id);
    saveStagedListings(updated);
    saveListedProducts([{ ...listing, ebayDraftId: draftId }, ...listedProducts]);
    setActiveTab('listed');
  };

  const handleDeleteListedListing = (id: string) => {
    saveListedProducts(listedProducts.filter(l => l.id !== id));
  };

  const handleArchiveListedListing = (id: string) => {
    saveListedProducts(listedProducts.map(l => l.id === id ? { ...l, archived: !l.archived } : l));
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
        {activeTab === 'new' ? (
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
