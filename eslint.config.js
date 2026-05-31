import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` is build output; `archive/` holds shelved Shopify code that is not
  // shipped and shouldn't gate the build.
  globalIgnores(['dist', 'archive']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `catch (e: any)` and a handful of event/prop escape hatches use `any`
      // intentionally. Keep the signal as a warning (visible, fixable over
      // time) rather than a hard error that blocks the lint gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      // The React Compiler rules (purity / refs / set-state-in-effect) are
      // still experimental and fire on several legitimate, working patterns
      // (e.g. `Date.now()` in render, an immediate loading-state set in an
      // effect). Surface them as warnings so the real errors (rules-of-hooks,
      // no-empty, unused-expressions, etc.) remain hard failures.
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
