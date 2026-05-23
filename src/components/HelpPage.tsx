import type React from 'react';
import {
  HelpCircle, PlusCircle, Layers, List, Check, Download, DollarSign,
  BarChart2, Telescope, Zap, Settings, Shield,
} from 'lucide-react';

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section style={{
    background: 'var(--glass-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '1.25rem 1.5rem',
    marginBottom: '1rem',
  }}>
    <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ color: '#a5b4fc', display: 'inline-flex' }}>{icon}</span>
      {title}
    </h3>
    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      {children}
    </div>
  </section>
);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li style={{ marginBottom: '0.4rem' }}>
    <strong style={{ color: 'var(--text-primary)' }}>Step {n}:</strong> {children}
  </li>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <code style={{
    background: 'rgba(255,255,255,0.08)',
    padding: '1px 6px',
    borderRadius: '4px',
    fontSize: '0.82rem',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  }}>{children}</code>
);

export default function HelpPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <HelpCircle size={26} color="#a5b4fc" />
          Help &amp; User Guide
        </h1>
        <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          A complete walkthrough of how to use ListingStager — from connecting your eBay account
          to creating, optimizing, and tracking your listings.
        </p>
      </div>

      <Section icon={<Check size={18} />} title="Getting Started">
        <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <Step n={1}>Log in with your account credentials on the login screen.</Step>
          <Step n={2}>Click <Kbd>Connect to eBay</Kbd> in the top-right of the app to authorize ListingStager
            with your eBay seller account. This is required to publish listings, sync sales, and import
            existing inventory.</Step>
          <Step n={3}>Open the <Kbd>Settings</Kbd> tab and confirm your eBay business policies
            (payment, shipping, return) are loaded. Click <Kbd>Refresh Policies</Kbd> if needed.</Step>
          <Step n={4}>You're ready to start creating listings — head to <Kbd>New Listing</Kbd>.</Step>
        </ol>
        <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Token expiry:</strong> The eBay token indicator in the
          top-right shows how many days remain before re-authorization is required. If it turns yellow ({'<'}=7d) or
          red ({'<'}=2d), click <Kbd>Reconnect</Kbd>.
        </p>
      </Section>

      <Section icon={<PlusCircle size={18} />} title="New Listing — Single Item">
        <p>The fastest way to create a single listing using AI-generated content.</p>
        <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <Step n={1}>Click <Kbd>New Listing</Kbd> in the sidebar.</Step>
          <Step n={2}>Drag-and-drop or upload photos of your item. The first image becomes the gallery image on eBay.</Step>
          <Step n={3}>(Optional) Add written instructions or notes — brand, condition details, model number, etc.
            The more context you give, the better the AI output.</Step>
          <Step n={4}>Click <Kbd>Generate Listing</Kbd>. The AI produces a title, description, item specifics,
            condition, suggested price, and tags.</Step>
          <Step n={5}>Review and edit the generated content in the right panel. You can fine-tune everything before staging.</Step>
          <Step n={6}>Click <Kbd>Stage Listing</Kbd> to save it as a draft. It moves to the <Kbd>Staged</Kbd> tab.</Step>
        </ol>
      </Section>

      <Section icon={<Layers size={18} />} title="Bulk Create — Multiple Items at Once">
        <p>Use this when you have a batch of items to list. Group photos by item, then process them all at once.</p>
        <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <Step n={1}>Open <Kbd>Bulk Create</Kbd>.</Step>
          <Step n={2}>Upload all photos for the batch. The tool groups them into items based on visual similarity (you can adjust groupings manually).</Step>
          <Step n={3}>Optionally provide shared instructions (e.g., "all from a 1980s electronics collection").</Step>
          <Step n={4}>Click <Kbd>Stage All</Kbd>. Each group becomes its own staged listing — a "Staged" badge appears as each one completes.</Step>
        </ol>
      </Section>

      <Section icon={<List size={18} />} title="Staged — Drafts Awaiting Listing">
        <p>The Staged tab is your workspace for drafts. Listings here have <em>not</em> yet been pushed to eBay.</p>
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li>Edit any field by clicking the listing to open the editor.</li>
          <li>Click <Kbd>Push to eBay</Kbd> on a single listing, or select multiple and push in bulk.</li>
          <li>Use the search bar, sort dropdown, and tag filter to navigate large draft sets.</li>
          <li>Deletions are reversible — a 5-second <Kbd>Undo</Kbd> toast appears after each delete.</li>
        </ul>
      </Section>

      <Section icon={<Check size={18} />} title="Listed — Active eBay Inventory">
        <p>Listings that are currently live on eBay.</p>
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>Health Score:</strong> a 0-100 rating that scores
            title quality, photos, item specifics completeness, and pricing competitiveness. Sort by health to
            find listings to optimize.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Tag filter:</strong> the tag list is collapsed by
            default — click <Kbd>Tags ({'{N}'})</Kbd> to expand and click any tag to filter.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Sync sold:</strong> click the sync button to pull
            recently sold items from eBay. Auto-sync also runs every 30 minutes.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Delist &amp; Relist:</strong> ends the current eBay
            listing and immediately republishes — useful for resetting stale listings.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Move back to Staged:</strong> if a listing was
            deleted on eBay, send it back to drafts to push again.</li>
        </ul>
      </Section>

      <Section icon={<Download size={18} />} title="eBay Import">
        <p>Pull existing listings from your eBay account into ListingStager so you can manage everything in one place.</p>
        <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <Step n={1}>Open <Kbd>eBay Import</Kbd>.</Step>
          <Step n={2}>Click <Kbd>Fetch Listings</Kbd> — eBay returns your active items page-by-page.</Step>
          <Step n={3}>Select which listings to import. Already-imported items are flagged so you don't duplicate.</Step>
          <Step n={4}>Imported listings appear in the <Kbd>Listed</Kbd> tab with the original eBay item ID linked.</Step>
        </ol>
      </Section>

      <Section icon={<DollarSign size={18} />} title="Sold — Completed Sales">
        <p>Auto-populated from eBay's sold-items feed. View revenue, sold dates, and net profit (after eBay/PayPal fees and shipping costs).</p>
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li>Click any sold listing to see fee breakdown and profit margin.</li>
          <li>Use <Kbd>Relist</Kbd> on a sold item to create a fresh staged copy.</li>
          <li>Mark items as sold manually if eBay's feed missed them.</li>
        </ul>
      </Section>

      <Section icon={<BarChart2 size={18} />} title="Analytics">
        <p>Charts and KPIs for your selling activity:</p>
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li>Revenue and profit over time</li>
          <li>Sell-through rate by category and tag</li>
          <li>Average days-to-sell</li>
          <li>Top-performing items and worst-performers</li>
        </ul>
      </Section>

      <Section icon={<Zap size={18} />} title="Optimizer">
        <p>Bulk-improve underperforming listings. The optimizer scans your live items and suggests:</p>
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li>Better titles (more keywords, better SEO)</li>
          <li>Stronger item specifics</li>
          <li>Price adjustments based on current market data</li>
          <li>New tags / categorization</li>
        </ul>
        <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>Review changes per-listing before applying — nothing updates on eBay without your confirmation.</p>
      </Section>

      <Section icon={<Telescope size={18} />} title="Repricing Advisor">
        <p>Available inside the Listed tab — analyzes each item's age, watch count, and market comps to recommend
          price drops or holds. Apply suggestions one at a time or in bulk.</p>
      </Section>

      <Section icon={<Settings size={18} />} title="Settings">
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>Business Policies:</strong> select default payment,
            shipping, and return policies for new listings.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Default Item Specifics:</strong> values that auto-fill
            on every new listing (location, brand, etc.).</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Cost basis &amp; fees:</strong> configure shipping
            label cost defaults and fee percentages used for net-profit calculations.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Refresh Policies:</strong> re-pulls the latest policy
            list from eBay if you've added new ones in Seller Hub.</li>
        </ul>
      </Section>

      <Section icon={<Shield size={18} />} title="Admin (Superadmin only)">
        <p>For account owners — manage users in your company, change roles, reset passwords, and view audit logs.</p>
      </Section>

      <Section icon={<HelpCircle size={18} />} title="Tips &amp; Troubleshooting">
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>"eBay Configuration Error" on Connect:</strong> the
            backend is missing eBay API credentials — contact your administrator.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Push to eBay fails:</strong> usually a missing item
            specific or invalid category. The error toast names the field — fix it in the editor and retry.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Images not appearing:</strong> first uploads go to
            Cloudinary; if that's unreachable, images fall back to local browser storage. Re-upload them after
            connectivity returns.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Sold items not showing:</strong> auto-sync runs every
            30 minutes. Click the sync button on the Listed tab to force an immediate pull.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Sidebar collapsed:</strong> click the chevron at the
            bottom of the sidebar to expand/collapse — your choice is remembered.</li>
        </ul>
      </Section>

      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Need more help? Reach out to your administrator or check the in-app tooltips by hovering over any button.
      </div>
    </div>
  );
}
