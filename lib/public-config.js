// This contains only the public wedding content already exposed by /api/config.
// Never include guests, sessions, environment variables or database credentials.
export function publicCatalog(variants) {
  return variants.map(({ side, label, enabled, config }) => ({
    side, label, enabled, ...(enabled ? { config } : {}),
  }));
}
