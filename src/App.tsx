import { useState, useEffect } from 'react';
import { Settings, PlusCircle, List, Check } from 'lucide-react';
import './index.css';

// We will create these components next
import Uploader from './components/Uploader';
import ResultsEditor from './components/ResultsEditor';
import StagedListingsView from './components/StagedListings';
import ListedProductsView from './components/ListedProducts';
import type { StagedListing } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<'new' | 'staged' | 'listed'>('new');
  const [apiKey, setApiKey] = useState('');
  const [ebayToken, setEbayToken] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempEbayToken, setTempEbayToken] = useState('');
  const [ebayConfig, setEbayConfig] = useState({
    fulfillmentPolicy: '', paymentPolicy: '', returnPolicy: '',
    merchantLocation: '', categoryId: ''
  });
  const [tempEbayConfig, setTempEbayConfig] = useState(ebayConfig);
  const [isFetchingConfig, setIsFetchingConfig] = useState(false);
  
  // App state for the current generation
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
  const [listedProducts, setListedProducts] = useState<StagedListing[]>([]);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setTempApiKey(savedKey);
    }
    const savedEbay = localStorage.getItem('ebay_api_token');
    if (savedEbay) {
      setEbayToken(savedEbay);
      setTempEbayToken(savedEbay);
    }
    const savedConfig = localStorage.getItem('ebay_push_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setEbayConfig(parsed);
        setTempEbayConfig(parsed);
      } catch (e) {
        console.error('Failed to parse config');
      }
    }
    
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

  const saveSettings = () => {
    localStorage.setItem('gemini_api_key', tempApiKey);
    localStorage.setItem('ebay_api_token', tempEbayToken);
    localStorage.setItem('ebay_push_config', JSON.stringify(tempEbayConfig));
    setApiKey(tempApiKey);
    setEbayToken(tempEbayToken);
    setEbayConfig(tempEbayConfig);
    setIsSettingsOpen(false);
  };

  const saveStagedListings = (listings: StagedListing[]) => {
    setStagedListings(listings);
    localStorage.setItem('staged_ebay_listings', JSON.stringify(listings));
  };

  const handleAutoFetchStats = async () => {
    if (!tempEbayToken) {
      alert("Please enter your eBay User OAuth Token first, then click Auto-Fetch!");
      return;
    }
    setIsFetchingConfig(true);
    try {
      const resp = await fetch('http://localhost:3001/api/ebay/settings', {
        headers: { 'Authorization': `Bearer ${tempEbayToken}` }
      });
      if (!resp.ok) {
        let errText = await resp.text();
        try { errText = JSON.parse(errText).error; } catch {}
        throw new Error(errText);
      }
      const data = await resp.json();
      
      setTempEbayConfig(prev => ({
        ...prev,
        fulfillmentPolicy: data.fulfillmentPolicy || prev.fulfillmentPolicy,
        paymentPolicy: data.paymentPolicy || prev.paymentPolicy,
        returnPolicy: data.returnPolicy || prev.returnPolicy,
        merchantLocation: data.merchantLocation || prev.merchantLocation
      }));
      alert("Successfully auto-fetched policies and location from your eBay account!");
    } catch (e: any) {
      alert("Failed to auto-fetch settings. Note: Ensure your eBay Token has the `sell.account.readonly` and `sell.inventory.readonly` scopes!\nError: " + e.message);
    } finally {
      setIsFetchingConfig(false);
    }
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

  return (
    <div className="app-container">
      {/* Navbar */}
      <header className="glass-panel" style={{ margin: '1rem', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
            eB
          </div>
          <h1 style={{ fontSize: '1.5rem' }}>Listing<span className="text-gradient">Stager</span></h1>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', padding: '4px' }}>
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
          <button className="btn-icon" onClick={() => setIsSettingsOpen(true)} title="Settings">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '0 1rem 2rem 1rem', flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {!apiKey && (
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', borderLeft: '4px solid #ef4444' }}>
            <h3 style={{ color: '#fca5a5', marginBottom: '8px' }}>API Key Required</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Please configure your Google Gemini API key in settings to enable listing generation.</p>
            <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setIsSettingsOpen(true)}>
              <Settings size={18} /> Configure Settings
            </button>
          </div>
        )}

        {activeTab === 'new' ? (
          <div className="animate-fade-in" style={{ display: 'grid', gap: '2rem', gridTemplateColumns: generatedData ? 'minmax(400px, 1fr) minmax(600px, 1.8fr)' : 'max-content', justifyContent: 'center' }}>
            <div style={{ width: generatedData ? '100%' : '600px', maxWidth: '100%', margin: generatedData ? '0' : '0 auto' }}>
              <Uploader 
                images={images}
                setImages={setImages}
                instructions={instructions}
                setInstructions={setInstructions}
                onGenerate={async (imgs, instrs) => {
                  // We will call the AI service here later
                  setIsGenerating(true);
                  try {
                    const aiService = await import('./services/ai');
                    const results = await aiService.generateListing(imgs, instrs, apiKey);
                    setGeneratedData(results);
                  } catch (e: any) {
                    alert('Error generating listing: ' + e.message);
                  } finally {
                    setIsGenerating(false);
                  }
                }}
                isGenerating={isGenerating}
                disabled={!apiKey}
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
            <StagedListingsView 
              listings={stagedListings} 
              onUpdate={handleUpdateStagedListing}
              onDelete={handleDeleteStagedListing}
            />
          </div>
        ) : (
          <div className="animate-fade-in">
            <ListedProductsView listings={listedProducts} />
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '500px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Settings</h2>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                Google Gemini API Key
              </label>
              <input type="password" className="input-base" value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)} placeholder="AIzaSy..." />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>
                eBay Integration (Required for Live Push)
              </h3>
              <button 
                onClick={handleAutoFetchStats} 
                disabled={isFetchingConfig} 
                style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                {isFetchingConfig ? 'Fetching...' : '⚡ Auto-Fetch'}
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                eBay User OAuth Token
              </label>
              <input type="password" className="input-base" value={tempEbayToken}
                onChange={e => setTempEbayToken(e.target.value)} placeholder="v^1.1#i^1#r^..." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Fulfillment Policy ID</label>
                <input type="text" className="input-base" value={tempEbayConfig.fulfillmentPolicy}
                  onChange={e => setTempEbayConfig({...tempEbayConfig, fulfillmentPolicy: e.target.value})} placeholder="e.g. 12345678013" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Payment Policy ID</label>
                <input type="text" className="input-base" value={tempEbayConfig.paymentPolicy}
                  onChange={e => setTempEbayConfig({...tempEbayConfig, paymentPolicy: e.target.value})} placeholder="e.g. 12345678014" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Return Policy ID</label>
                <input type="text" className="input-base" value={tempEbayConfig.returnPolicy}
                  onChange={e => setTempEbayConfig({...tempEbayConfig, returnPolicy: e.target.value})} placeholder="e.g. 12345678015" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Merchant Location Key</label>
                <input type="text" className="input-base" value={tempEbayConfig.merchantLocation}
                  onChange={e => setTempEbayConfig({...tempEbayConfig, merchantLocation: e.target.value})} placeholder="e.g. DEFAULT" />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Default eBay Category ID</label>
              <input type="text" className="input-base" value={tempEbayConfig.categoryId}
                onChange={e => setTempEbayConfig({...tempEbayConfig, categoryId: e.target.value})} placeholder="e.g. 261068" />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-secondary" onClick={() => setIsSettingsOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={saveSettings}>
                <Check size={18} /> Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
