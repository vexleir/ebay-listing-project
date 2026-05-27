// Per-company AI token quota helpers extracted from server/app.js.
// The reserve constants set how much headroom a single AI call must have
// before it is allowed through; they are loaded once at module init so route
// handlers stay synchronous-looking and quota math is consistent.

const { getAiDailyQuotaStatus, incrementTokenUsage } = require('../listings');
const { parsePositiveIntEnv } = require('./rateLimit');

const AI_GENERATE_QUOTA_RESERVE_TOKENS = parsePositiveIntEnv('AI_GENERATE_QUOTA_RESERVE_TOKENS', 5000);
const AI_OPTIMIZE_QUOTA_RESERVE_TOKENS = parsePositiveIntEnv('AI_OPTIMIZE_QUOTA_RESERVE_TOKENS', 3000);

// Returns true if the request may proceed. Writes a 429 response and returns
// false if the company has insufficient quota for the requested reserve.
// Route handlers should `if (!await enforceAiDailyQuota(req, res, RESERVE)) return;`
async function enforceAiDailyQuota(req, res, reserveTokens) {
  const quota = await getAiDailyQuotaStatus(req.companyId);
  if (quota.remainingTokens < reserveTokens) {
    res.status(429).json({
      error: 'Your AI quota for today has been reached.',
      code: 'AI_QUOTA_EXCEEDED',
      resetAt: quota.resetAt,
      quota: {
        day: quota.day,
        limit: quota.limit,
        totalTokens: quota.totalTokens,
        remainingTokens: quota.remainingTokens,
        reserveTokens,
      },
    });
    return false;
  }
  return true;
}

// Persist token counts after a successful AI call. Swallows persistence
// errors with a log line — failing to record usage must not break the
// successful response to the seller.
async function recordTokenUsage(companyId, tokenUsage) {
  if (!tokenUsage) return;
  try {
    await incrementTokenUsage(companyId, tokenUsage.promptTokens, tokenUsage.completionTokens);
  } catch (e) {
    console.error('[token-usage] failed to record usage:', e.message);
  }
}

module.exports = {
  AI_GENERATE_QUOTA_RESERVE_TOKENS,
  AI_OPTIMIZE_QUOTA_RESERVE_TOKENS,
  enforceAiDailyQuota,
  recordTokenUsage,
};
