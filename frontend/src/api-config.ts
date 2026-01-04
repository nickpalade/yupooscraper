// API base URL configuration
// In production (Netlify), use the Render backend URL
// In development, use localhost

const getApiBaseUrl = (): string => {
  // If running on Netlify (production)
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://yupooscraper.onrender.com';
  }
  // Development environment
  return 'http://localhost:8000';
};

export const API_BASE_URL = getApiBaseUrl();

export const buildApiUrl = (endpoint: string): string => {
  // If endpoint already starts with http, return as-is
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  // Otherwise, prepend the base URL
  return `${API_BASE_URL}${endpoint}`;
};
