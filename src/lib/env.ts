const fallbackApiBaseUrl = 'http://localhost:8787';

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL ?? fallbackApiBaseUrl).trim();
}

export function isApiConfigured() {
  return getApiBaseUrl().length > 0;
}
