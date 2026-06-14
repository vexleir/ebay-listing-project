import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PushToEbayModal, { type PushModalState } from './PushToEbayModal';
import type { StagedListing } from '../../types';

function makeListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Vintage Camera',
    description: '',
    priceRecommendation: '24.99',
    category: 'Cameras',
    categoryId: '11',
    condition: 'Used — Looks great',
    images: [],
    itemSpecifics: {},
    shippingEstimate: '',
    status: 'staged',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeState(overrides: Partial<PushModalState> = {}): PushModalState {
  return {
    listing: makeListing(),
    conditionId: '3000',
    validConditions: [],
    scheduleDate: '',
    fulfillmentPolicyId: '',
    categoryId: '',
    fulfillmentPolicies: [],
    loading: false,
    acceptOffers: true,
    autoAcceptPrice: '',
    minOfferPrice: '',
    ...overrides,
  };
}

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    state: makeState(),
    onChange: vi.fn(),
    extraSpecifics: [],
    onExtraSpecificsChange: vi.fn(),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

describe('PushToEbayModal', () => {
  it('renders the listing title and the Confirm header', () => {
    render(<PushToEbayModal {...defaults()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Push to eBay')).toBeInTheDocument();
    expect(screen.getByText('Vintage Camera')).toBeInTheDocument();
  });

  it('shows the loading state when state.loading=true', () => {
    render(<PushToEbayModal {...defaults({ state: makeState({ loading: true }) })} />);
    expect(screen.getByText(/Loading policies & category/)).toBeInTheDocument();
    // The form fields should not render while loading.
    expect(screen.queryByLabelText('eBay condition')).toBeNull();
  });

  it('renders all 9 default eBay conditions when validConditions is empty', () => {
    render(<PushToEbayModal {...defaults()} />);
    const select = screen.getByLabelText('eBay condition') as HTMLSelectElement;
    expect(select.querySelectorAll('option').length).toBe(9);
    expect(select.value).toBe('3000');
  });

  it('renders only the category-valid conditions when validConditions is supplied + shows the helper text', () => {
    const validConditions = [
      { id: '1000', label: 'New' },
      { id: '3000', label: 'Used' },
    ];
    render(<PushToEbayModal {...defaults({ state: makeState({ validConditions }) })} />);
    const select = screen.getByLabelText('eBay condition') as HTMLSelectElement;
    expect(select.querySelectorAll('option').length).toBe(2);
    expect(screen.getByText(/Showing 2 conditions valid for this category/)).toBeInTheDocument();
  });

  it('fires onChange with a conditionId patch when the select changes', () => {
    const onChange = vi.fn();
    render(<PushToEbayModal {...defaults({ onChange })} />);
    fireEvent.change(screen.getByLabelText('eBay condition'), { target: { value: '4000' } });
    expect(onChange).toHaveBeenCalledWith({ conditionId: '4000' });
  });

  it('renders the Shipping Policy select only when fulfillmentPolicies is non-empty', () => {
    const { rerender } = render(<PushToEbayModal {...defaults()} />);
    expect(screen.queryByLabelText('Shipping policy')).toBeNull();
    rerender(
      <PushToEbayModal
        {...defaults({
          state: makeState({ fulfillmentPolicies: [{ id: 'p1', name: 'USPS Ground' }] }),
        })}
      />,
    );
    expect(screen.getByLabelText('Shipping policy')).toBeInTheDocument();
    expect(screen.getByText('USPS Ground')).toBeInTheDocument();
  });

  it('toggles the schedule input on and off via the checkbox', () => {
    const onChange = vi.fn();
    render(<PushToEbayModal {...defaults({ onChange })} />);
    expect(screen.getByText(/Listing will go live immediately when pushed/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Schedule for later/));
    // Toggling on calls onChange with a non-empty scheduleDate (21 days out).
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.scheduleDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('hides the Best Offer threshold inputs when acceptOffers=false', () => {
    render(<PushToEbayModal {...defaults({ state: makeState({ acceptOffers: false }) })} />);
    expect(screen.queryByLabelText('Auto-accept price')).toBeNull();
    expect(screen.queryByLabelText('Auto-decline price')).toBeNull();
  });

  it('warns when the listing is missing the "Type" item specific and the user has not added one', () => {
    render(<PushToEbayModal {...defaults()} />);
    expect(screen.getByText(/"Type" is required for most eBay categories/)).toBeInTheDocument();
  });

  it('hides the missing-Type warning when the listing already has a Type specific (case-insensitive)', () => {
    render(<PushToEbayModal {...defaults({ state: makeState({ listing: makeListing({ itemSpecifics: { TYPE: 'Camera' } }) }) })} />);
    expect(screen.queryByText(/"Type" is required for most eBay categories/)).toBeNull();
  });

  it('hides the missing-Type warning when the user has added a Type extra specific', () => {
    render(<PushToEbayModal {...defaults({ extraSpecifics: [{ name: 'type', value: 'T-Shirt' }] })} />);
    expect(screen.queryByText(/"Type" is required for most eBay categories/)).toBeNull();
  });

  it('appends an empty row to extraSpecifics when "+ Add field" is clicked', () => {
    const onExtraSpecificsChange = vi.fn();
    render(<PushToEbayModal {...defaults({ onExtraSpecificsChange })} />);
    fireEvent.click(screen.getByText('+ Add field'));
    expect(onExtraSpecificsChange).toHaveBeenCalledWith([{ name: '', value: '' }]);
  });

  it('fires onClose on Escape and onConfirm on the Push button', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<PushToEbayModal {...defaults({ onClose, onConfirm })} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Push to eBay'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the backdrop is clicked but NOT when the panel is clicked', () => {
    const onClose = vi.fn();
    render(<PushToEbayModal {...defaults({ onClose })} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── INV-002 warn-before-push gate ───────────────────────────────────────

  it('does NOT render the SKU conflict warning when liveSkuConflicts is empty', () => {
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: [] })} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('SKU already live on eBay')).toBeNull();
  });

  it('renders the SKU conflict warning with title + count when there is a conflict', () => {
    const conflict = makeListing({ id: 'live1', title: 'Live Camera Listing', ebayDraftId: '123456789012' });
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: [conflict] })} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('SKU already live on eBay')).toBeInTheDocument();
    expect(screen.getByText(/This SKU is currently on 1 live listing/)).toBeInTheDocument();
    expect(screen.getByText(/Live Camera Listing/)).toBeInTheDocument();
    expect(screen.getByText('123456789012')).toBeInTheDocument();
  });

  it('switches to the plural copy when there are multiple conflicts', () => {
    const a = makeListing({ id: 'a', title: 'A' });
    const b = makeListing({ id: 'b', title: 'B' });
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: [a, b] })} />);
    expect(screen.getByText(/This SKU is currently on 2 live listings/)).toBeInTheDocument();
  });

  it('truncates the conflict list at 3 entries with a +N more line', () => {
    const conflicts = [1, 2, 3, 4, 5].map((n) => makeListing({ id: String(n), title: `Item ${n}` }));
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: conflicts })} />);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    // First three should render, fourth should not.
    expect(screen.getByText(/Item 1/)).toBeInTheDocument();
    expect(screen.getByText(/Item 3/)).toBeInTheDocument();
    expect(screen.queryByText(/Item 4/)).toBeNull();
  });

  it('disables the Push button until the seller acknowledges the conflict', () => {
    const onConfirm = vi.fn();
    const conflict = makeListing({ id: 'live1' });
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: [conflict], onConfirm })} />);
    const pushBtn = screen.getByRole('button', { name: 'Push to eBay' });
    expect(pushBtn).toBeDisabled();
    // Clicking it while disabled is a no-op.
    fireEvent.click(pushBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('re-enables Push after the acknowledgment checkbox is ticked', () => {
    const onConfirm = vi.fn();
    const conflict = makeListing({ id: 'live1' });
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: [conflict], onConfirm })} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Acknowledge SKU collision and push anyway' }));
    const pushBtn = screen.getByRole('button', { name: 'Push to eBay' });
    expect(pushBtn).not.toBeDisabled();
    fireEvent.click(pushBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does NOT disable the Push button when no conflict exists', () => {
    render(<PushToEbayModal {...defaults({ liveSkuConflicts: [] })} />);
    expect(screen.getByRole('button', { name: 'Push to eBay' })).not.toBeDisabled();
  });
});
