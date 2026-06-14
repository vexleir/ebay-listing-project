function isEnabledFromEnv(env) {
  return (env || process.env).ENABLE_DEBUG_ENDPOINTS === 'true';
}

function createRequireDebugEndpointsEnabled(options = {}) {
  const { env, enabled } = options;
  return function requireDebugEndpointsEnabled(req, res, next) {
    const allowed = typeof enabled === 'boolean' ? enabled : isEnabledFromEnv(env);
    if (!allowed) {
      return res.status(404).json({ error: 'Not found' });
    }
    next();
  };
}

module.exports = { createRequireDebugEndpointsEnabled, isEnabledFromEnv };
