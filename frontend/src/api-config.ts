// API base URL configuration
// In production (Netlify), use the Render backend URL
// In development, use relative paths to leverage Vite proxy

const getApiBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return ''; // SSR
  }
  
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // Check if we're in development:
  // 1. Running on Vite's default port (5173)
  // 2. Running on localhost/127.0.0.1/0.0.0.0
  // 3. Running on a local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const isDevPort = port === '5173' || port === '5174';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  const isLocalNetwork = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname);
  
  const isDevelopment = isDevPort || isLocalhost || isLocalNetwork;
  
  console.log('[API Config] Current hostname:', hostname, 'port:', port);
  console.log('[API Config] Is development:', isDevelopment);
  
  if (!isDevelopment) {
    // Production: use full Render backend URL
    console.log('[API Config] Using production backend: https://yupooscraper.onrender.com');
    return 'https://yupooscraper.onrender.com';
  }
  
  // Development: return empty string to use relative paths (Vite proxy)
  console.log('[API Config] Using development mode: relative paths via Vite proxy');
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

export const buildApiUrl = (endpoint: string): string => {
  // If endpoint already starts with http, return as-is
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  // Otherwise, prepend the base URL (empty in dev, full URL in prod)
  const finalUrl = `${API_BASE_URL}${endpoint}`;
  console.log('[API Config] Built URL:', finalUrl, 'from endpoint:', endpoint);
  return finalUrl;
};
