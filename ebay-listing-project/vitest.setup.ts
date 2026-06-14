// Vitest setup. Pulls in @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveAttribute, etc.) and runs cleanup after each test so components
// from a previous test don't leak into the next.

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
