// AI-002 — structured vendor-call telemetry.
//
// Every AI call gets logged with:
//   companyId, useCase, model, promptVersion, promptName, promptTokens,
//   completionTokens, totalTokens, latencyMs, success, errorMessage
//
// Two sinks today:
//   1. stdout (console.log) — always on, structured JSON line.
//   2. mongo `ai_calls` collection (best-effort, swallow failures).
//
// IMPORTANT: never log image bytes, full prompt text with user PII, or API
// keys. Only the metadata above. If you need to log more, route it through
// a redaction helper before adding it here.

const { getDb } = require('../../db');

const COLLECTION = 'ai_calls';

async function recordAiCall(entry) {
  // Required fields — defaults so a malformed call doesn't crash the
  // record path. The pipeline that consumes this collection assumes every
  // row has at least { companyId, useCase, model, success, recordedAt }.
  const row = {
    companyId: entry.companyId || null,
    useCase: entry.useCase || 'unknown',
    model: entry.model || null,
    promptName: entry.promptName || null,
    promptVersion: entry.promptVersion || null,
    promptTokens: entry.promptTokens || 0,
    completionTokens: entry.completionTokens || 0,
    totalTokens: entry.totalTokens || 0,
    latencyMs: entry.latencyMs || 0,
    success: entry.success !== false,
    errorMessage: entry.errorMessage || null,
    recordedAt: new Date(),
  };

  // 1) Always emit a JSON log line so vendor spend is greppable in container
  //    logs even when Mongo is unreachable.
  console.log('[ai-telemetry]', JSON.stringify({ ...row, recordedAt: row.recordedAt.toISOString() }));

  // 2) Best-effort persistence to Mongo.
  try {
    const db = await getDb();
    await db.collection(COLLECTION).insertOne(row);
  } catch (e) {
    console.warn('[ai-telemetry] failed to persist:', e.message);
  }
}

// Wrap an async AI call. Times it, captures token usage from the resolved
// value's tokenUsage shape (matching ai.js + optimizer.js return shapes),
// and records both success and failure rows.
async function withAiTelemetry({ companyId, useCase, promptName, promptVersion }, run) {
  const t0 = Date.now();
  try {
    const result = await run();
    const latencyMs = Date.now() - t0;
    const tokenUsage = result?.tokenUsage || {};
    await recordAiCall({
      companyId,
      useCase,
      promptName,
      promptVersion,
      model: tokenUsage.model || null,
      promptTokens: tokenUsage.promptTokens || 0,
      completionTokens: tokenUsage.completionTokens || 0,
      totalTokens: tokenUsage.totalTokens || (tokenUsage.promptTokens || 0) + (tokenUsage.completionTokens || 0),
      latencyMs,
      success: true,
    });
    return result;
  } catch (e) {
    const latencyMs = Date.now() - t0;
    await recordAiCall({
      companyId,
      useCase,
      promptName,
      promptVersion,
      success: false,
      errorMessage: e?.message || String(e),
      latencyMs,
    });
    throw e;
  }
}

module.exports = { recordAiCall, withAiTelemetry, COLLECTION };
