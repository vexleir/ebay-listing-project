# Release Checklist

**Owner:** the developer cutting the release  
**Source of truth:** this checklist must pass for every release candidate. Do not skip steps. If a step does not apply, write "n/a — reason" instead of removing it.

This checklist exists because the consultant review and the [Implementation Plan](IMPLEMENTATION_UPDATE_PLAN.md) (section 10) require a repeatable gate that a non-original developer can follow.

## 1. Pre-flight: clean working state

- [ ] On the intended release branch (typically `main`) with no uncommitted changes (`git status`).
- [ ] Local branch is up to date with `origin` (`git fetch && git status`).
- [ ] No tracked secret/token files. Confirm with:
  - `git ls-files | findstr /I tokens` (Windows) or `git ls-files | grep -i tokens` (POSIX) returns nothing other than docs.
  - `server/ebay_tokens.json` does not exist.

## 2. Environment configuration

- [ ] Target environment is identified (local, beta, production) and recorded in the release notes.
- [ ] `server/.env` (production) is current. Spot-check the following values against the intended environment:
  - `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME` match the right eBay app.
  - `EBAY_FULFILLMENT_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID`, `EBAY_RETURN_POLICY_ID` match the right seller account.
  - `GEMINI_API_KEY` is set and not the placeholder value.
  - `JWT_SECRET` is set and non-trivial.
  - `ENABLE_DEBUG_ENDPOINTS=false` (or absent) for any non-local environment.
  - Rate limit env vars are present (see `server/.env.example` for the full list); reduce defaults only with a documented reason.
  - `AI_DAILY_TOKEN_LIMIT` is set to the chosen plan default.

## 3. Build and test

Run from the repo root:

- [ ] `npm run build` — Vite/TS build passes with no errors.
- [ ] `npm run lint` — ESLint passes, or any remaining lint findings have a tech-lead waiver noted in the release notes.
- [ ] `npm run test:server` — all server tests pass. Current expected pass count is **52+ tests** across:
  - `tests/security-hygiene.test.js`
  - `tests/debug-endpoint-auth.test.js`
  - `tests/ebay-xml.test.js`
  - `tests/condition-fallback.test.js`

## 4. Security gates

- [ ] No public/unauthenticated debug endpoints exist. Search the diff since the previous release for `debug-auth-public` — must return zero matches.
- [ ] `/api/ebay/debug-auth` and `/api/listings/debug` are wired through `requireSuperAdmin` and `requireDebugEndpointsEnabled` (covered by `debug-endpoint-auth.test.js`).
- [ ] Rate limiting is enabled in production (`API_RATE_LIMIT_PER_MINUTE`, `AUTH_API_RATE_LIMIT_PER_MINUTE`, `AI_RATE_LIMIT_PER_HOUR`, `IMAGE_RATE_LIMIT_PER_HOUR`, `EBAY_READ_RATE_LIMIT_PER_HOUR`, `EBAY_WRITE_RATE_LIMIT_PER_HOUR`, `COMPS_RATE_LIMIT_PER_HOUR`).
- [ ] AI daily token quota enforcement is enabled (`AI_DAILY_TOKEN_LIMIT` is set, and the Analytics panel renders the quota row).
- [ ] No new secret-like values appear in logs or in committed code (`git diff <previous-tag>..HEAD -- '*.js' '*.ts' '*.tsx'` review).

## 5. Manual smoke test

Run against the target environment (sandbox for production-credential testing where possible):

1. [ ] Log in with a known user.
2. [ ] Connect or verify eBay connection (or, if already connected, confirm `auth-status` returns `connected: true`).
3. [ ] Generate a listing from an image and short instructions.
4. [ ] Edit the generated title/description/item specifics.
5. [ ] Stage the listing.
6. [ ] Push the listing to eBay (sandbox is acceptable; record the item ID and revert if pushed to production by mistake).
7. [ ] Import the active eBay listing back into the app.
8. [ ] Run a sold-items sync.
9. [ ] Run the optimizer on one staged or active listing.
10. [ ] Hit a rate-limited endpoint repeatedly to confirm a `429` with a user-readable message appears.

If any step fails, do not ship — file a release-blocker issue and roll back.

## 6. Release notes and rollback

- [ ] Release notes summarize what changed, who reviewed, and what the rollback path is.
- [ ] Tag the release commit (`git tag vX.Y.Z`) and push the tag.
- [ ] Rollback plan is documented in the release notes:
  - Mongo: no destructive migrations introduced this release, or the migration ships with a documented reverse step.
  - Code: previous tag/sha noted so a redeploy can pin to it.

## 7. Sign-off

- [ ] Release owner has completed all sections above and recorded the date/time in the release notes.
- [ ] Tech lead acknowledgement recorded (Slack/email/PR comment is fine, but link it from the notes).

---

## Quick reference: minimum commands

```bash
# From repo root
git status
git fetch && git status
npm run build
npm run lint
npm run test:server
```

Failure of any single quick-reference command blocks the release.
