import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useLocation, Routes, Route, useParams } from 'react-router-dom';
import ImagePreview from './ImagePreview';
import NavigationBar from './NavigationBar';
import { useSettings, SettingsModal } from './SettingsContext';
import ScraperGUI from './ScraperGUI';
import MainContent from './MainContent';
import LoginModal from './LoginModal';
import MyLists from './MyLists';
import ConfirmDialog from './ConfirmDialog';
import SimilarSearchPage from './SimilarSearchPage';
import { Product, TagCategory } from './types';
import { buildApiUrl, buildImageUrl } from './api-config';
import { useURLState } from './useURLState';



interface ScrapeResponse {
  albums_processed: number;
  products_inserted: number;
}

interface ScrapeProgress {
  type: 'info' | 'progress' | 'success' | 'error' | 'complete' |
         'scanning_pages' | 'page_scanned' | 'scan_complete' | 'scrape_start' |
         'fetching_page' | 'album_scanning' | 'album_found' | 'page_scanned';
  message?: string;
  current?: number;
  total?: number;
  album_url?: string;
  albums_processed?: number;
  products_inserted?: number;
  failed?: number;
  page?: number;
  albums_found?: number;
  total_albums?: number;
  will_fetch?: number;
  album_number?: number;
  max?: number;
  url?: string;
  title?: string;
  tags?: string[];
}



// Helper functions for exponential slider
const exponentialSliderToValue = (sliderValue: number): number => {
  const normalized = sliderValue / 100;
  const value = 1 + 99999 * (normalized * normalized);
  return Math.max(1, Math.min(100000, Math.round(value)));
};

const valueToExponentialSlider = (value: number): number => {
  const clampedValue = Math.max(1, Math.min(100000, value));
  if (clampedValue === 1) return 0;
  const sliderValue = Math.sqrt((clampedValue - 1) / 99999) * 100;
  return Math.max(0, Math.min(100, sliderValue));
};

// Component to handle /preview=:productId routes - loads product and redirects to home
interface PreviewRedirectProps {
  products: Product[];
  itemsPerPage: number;
  setCurrentPage: (page: number) => void;
  setPreviewImage: (image: string | null) => void;
  setPreviewTitle: (title: string | null) => void;
  setPreviewProductId: (id: number | undefined) => void;
  setPreviewContext: (context: 'home' | 'lists') => void;
  navigate: (path: string) => void;
}

const PreviewRedirect: React.FC<PreviewRedirectProps> = ({
  products,
  itemsPerPage,
  setCurrentPage,
  setPreviewImage,
  setPreviewTitle,
  setPreviewProductId,
  setPreviewContext,
  navigate
}) => {
  const { productId } = useParams<{ productId: string }>();
  
  useEffect(() => {
    if (!productId) return;
    if (products.length === 0) return; // Wait for products to load
    
    const id = parseInt(productId, 10);
    const productIndex = products.findIndex(p => p.id === id);
    
    if (productIndex !== -1) {
      const product = products[productIndex];
      const page = Math.floor(productIndex / itemsPerPage) + 1;
      
      // Set preview state before navigating
      const imageSrc = product.image_path ? buildImageUrl(product.image_path) : product.image_url;
      setPreviewImage(imageSrc);
      setPreviewTitle(product.album_title);
      setPreviewProductId(id);
      setPreviewContext('home');
      setCurrentPage(page);
      
      // Update localStorage
      localStorage.setItem('yupooScraper_currentPage', page.toString());
      
      // Force navigation using window.location to ensure proper URL format
      const params = new URLSearchParams();
      if (page > 1) params.set('page', page.toString());
      params.set('preview', productId);
      const queryString = params.toString();
      window.location.replace(`/?${queryString}`);
    } else if (products.length > 0) {
      // Product not found and products have loaded, just go home
      window.location.replace('/');
    }
  }, [productId, products, itemsPerPage, setCurrentPage, setPreviewImage, setPreviewTitle, setPreviewProductId, setPreviewContext, navigate]);
  
  return null; // This component just handles the redirect
};


const App: React.FC = () => {
  const { settings } = useSettings();
  const { urlState, updateURLState: originalUpdateURLState } = useURLState();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Wrap updateURLState to prevent it from being called on similar search route
  // EXCEPT for preview updates which should be allowed
  const updateURLState = useCallback((updates: Parameters<typeof originalUpdateURLState>[0]) => {
    if (!location.pathname.startsWith('/similar/')) {
      originalUpdateURLState(updates);
    } else {
      // On similar routes, only allow preview updates
      if (updates.preview !== undefined) {
        // Manually update search params while preserving the current path
        const params = new URLSearchParams(location.search);
        if (updates.preview === null) {
          params.delete('preview');
        } else {
          params.set('preview', updates.preview);
        }
        const queryString = params.toString();
        const newUrl = queryString ? `${location.pathname}?${queryString}` : location.pathname;
        navigate(newUrl, { replace: true });
      }
    }
  }, [location.pathname, location.search, originalUpdateURLState, navigate]);
  
  const [showSettingsModal, setShowSettingsModal] = useState(urlState.showSettings);
  const [showLoginModal, setShowLoginModal] = useState(urlState.showLogin || urlState.showSignup);
  const [isSignupMode, setIsSignupMode] = useState(urlState.showSignup);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [colorSearchQuery, setColorSearchQuery] = useState('');
  const [typeSearchQuery, setTypeSearchQuery] = useState('');
  const [brandSearchQuery, setBrandSearchQuery] = useState('');

  // Scraping state
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [maxAlbums, setMaxAlbums] = useState(60);
  const [sliderValue, setSliderValue] = useState(valueToExponentialSlider(50));
  const [scrapingLoading, setScrapingLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(null);
  const [scrapeLogs, setScrapeLogs] = useState<ScrapeProgress[]>([]);

  // Search state
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProductsCount, setTotalProductsCount] = useState<number>(0);
  const [sortByColor, setSortByColor] = useState<string[]>([]);  // Color(s) to sort by
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true); // Re-added tagsLoading state
  const [exclusiveTypeSearch, setExclusiveTypeSearch] = useState<boolean>(false);

  // Stack-based navigation history for nested similar searches with localStorage persistence
  const [searchStateStack, setSearchStateStack] = useState<Array<{
    type: 'main' | 'similar';
    products: Product[];
    selectedTags: Set<string>;
    showViewAll: boolean;
    currentPage: number;
    sortByColor: string[];
    productId: number;
    similarProductId?: number;
    sameBrand?: boolean;
  }>>(() => {
    // Restore stack from localStorage on mount (without products - they'll be refetched)
    const savedStack = localStorage.getItem('yupooScraper_navigationStack');
    if (savedStack) {
      try {
        const parsed = JSON.parse(savedStack);
        // Convert selectedTags arrays back to Sets and add empty products array
        return parsed.map((state: any) => ({
          ...state,
          selectedTags: new Set(state.selectedTags),
          products: [] // Products will be refetched when navigating back
        }));
      } catch (e) {
        console.error('Failed to restore navigation stack:', e);
        localStorage.removeItem('yupooScraper_navigationStack');
        return [];
      }
    }
    return [];
  });
  const [isInSimilarSearchMode, setIsInSimilarSearchMode] = useState(false);
  
  // Flag to track if we initiated the navigation (vs user pasting URL)
  const navigationInitiatedByUs = useRef(false);
  
  // Flag to track if we've processed the initial preview from a shared link
  const initialPreviewProcessed = useRef(false);

  // --- State with localStorage Persistence ---
  const [showViewAll, setShowViewAll] = useState(() => localStorage.getItem('yupooScraper_showViewAll') === 'true');
  
  // Initialize selectedTags from URL first, then fall back to localStorage
  const [selectedTags, setSelectedTags] = useState(() => {
    if (urlState.tags.length > 0) {
      return new Set(urlState.tags);
    }
    const saved = localStorage.getItem('yupooScraper_selectedTags');
    return saved ? new Set(JSON.parse(saved)) : new Set<string>();
  });
  
  // Initialize currentPage from URL first, then fall back to localStorage
  // Don't use localStorage if we're on a preview route (it will be calculated)
  const [currentPage, setCurrentPage] = useState(() => {
    if (location.pathname.startsWith('/preview=')) {
      return 1; // Temporary, will be set by PreviewRedirect
    }
    if (urlState.page > 1) {
      return urlState.page;
    }
    const saved = localStorage.getItem('yupooScraper_currentPage');
    return saved ? parseInt(saved, 10) : 1;
  });

  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = localStorage.getItem('yupooScraper_itemsPerPage');
    const isFirstVisit = !localStorage.getItem('yupooScraper_hasVisited');
    if (saved) return parseInt(saved, 10);
    return isFirstVisit ? 60 : 60; // Default to 60
  });

  const [mobileGridCols, setMobileGridCols] = useState(() => {
    const saved = localStorage.getItem('yupooScraper_mobileGridCols');
    const isFirstVisit = !localStorage.getItem('yupooScraper_hasVisited');
    if (saved) return parseInt(saved, 10);
    return isFirstVisit ? 2 : 1; // Default to 2 on first visit
  });
  // --- End State with localStorage Persistence ---

  const [clearingDatabase, setClearingDatabase] = useState(false);
  const [clearDatabaseMessage, setClearDatabaseMessage] = useState<string | null>(null);
  const [showClearDatabaseConfirm, setShowClearDatabaseConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [previewProductId, setPreviewProductId] = useState<number | undefined>(undefined);
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);
  const [previewContext, setPreviewContext] = useState<'home' | 'lists'>('home');
  const [listProducts, setListProducts] = useState<Product[]>([]);

  
  // --- Core Data Loading and State Persistence ---

  // Sync URL state with modal visibility
  useEffect(() => {
    setShowSettingsModal(urlState.showSettings);
    setShowLoginModal(urlState.showLogin || urlState.showSignup);
    setIsSignupMode(urlState.showSignup);
  }, [urlState.showSettings, urlState.showLogin, urlState.showSignup]);

  // Save navigation stack to localStorage whenever it changes (without products to save space)
  useEffect(() => {
    // Convert Sets to arrays for JSON serialization and exclude products array
    const stackToSave = searchStateStack.map(state => ({
      type: state.type,
      selectedTags: Array.from(state.selectedTags),
      showViewAll: state.showViewAll,
      currentPage: state.currentPage,
      sortByColor: state.sortByColor,
      productId: state.productId,
      similarProductId: state.similarProductId,
      sameBrand: state.sameBrand
    }));
    try {
      localStorage.setItem('yupooScraper_navigationStack', JSON.stringify(stackToSave));
    } catch (e) {
      // If localStorage is full, clear the stack
      console.error('Failed to save navigation stack:', e);
      localStorage.removeItem('yupooScraper_navigationStack');
    }
  }, [searchStateStack]);

  // Clear stack if user manually navigated (pasted link) instead of using our navigation
  useEffect(() => {
    if (!navigationInitiatedByUs.current && location.pathname.startsWith('/similar/')) {
      // User navigated to similar page without using our buttons - clear the stack
      setSearchStateStack([]);
      localStorage.removeItem('yupooScraper_navigationStack');
    }
    // Reset the flag after checking
    navigationInitiatedByUs.current = false;
  }, [location.pathname]);

  // Sync selectedTags with URL (but not during similar search mode or on similar route)
  useEffect(() => {
    if (!isInSimilarSearchMode && !location.pathname.startsWith('/similar/')) {
      updateURLState({ tags: Array.from(selectedTags) });
    }
  }, [selectedTags, isInSimilarSearchMode, location.pathname, updateURLState]);

  // Sync currentPage with URL (but not during similar search mode or on similar route)
  useEffect(() => {
    if (!isInSimilarSearchMode && !location.pathname.startsWith('/similar/')) {
      updateURLState({ page: currentPage });
    }
  }, [currentPage, isInSimilarSearchMode, location.pathname, updateURLState]);

  // Check for existing auth token on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUsername = localStorage.getItem('username');
    const savedIsAdmin = localStorage.getItem('is_admin') === 'true';
    
    if (token && savedUsername) {
      verifyToken(token, savedUsername, savedIsAdmin);
    }
  }, []);

  const verifyToken = async (token: string, savedUsername: string, savedIsAdmin: boolean) => {
    try {
      const response = await axios.get(buildApiUrl('/api/auth/verify'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 200) {
        setAuthToken(token);
        setIsAuthenticated(true);
        setUsername(response.data.username);
        setIsAdmin(response.data.is_admin);
      } else {
        // Token is invalid, remove it
        handleLogout();
      }
    } catch (error) {
      // Token verification failed, remove it
      handleLogout();
    }
  };

  const handleLoginSuccess = (token: string, user: string, admin: boolean) => {
    setAuthToken(token);
    setIsAuthenticated(true);
    setUsername(user);
    setIsAdmin(admin);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    setAuthToken(null);
    setIsAuthenticated(false);
    setUsername('');
    setIsAdmin(false);
    navigate('/');
  };

  const handleLoginClick = () => {
    setShowLoginModal(true);
    setIsSignupMode(false);
    updateURLState({ showLogin: true, showSignup: false });
  };

  // Protect scraper tab - only admins can access
  useEffect(() => {
    if (location.pathname === '/scraper' && !isAdmin) {
      navigate('/');
      if (!isAuthenticated) {
        setShowLoginModal(true);
      }
    }
  }, [location.pathname, isAdmin, isAuthenticated, navigate]);

  // Fetch total products count on mount
  useEffect(() => {
    const fetchTotalCount = async () => {
      try {
        const response = await axios.get<Product[]>(buildApiUrl('/api/products/all'));
        setTotalProductsCount(response.data.length);
      } catch (error) {
        console.error('Failed to fetch total products count:', error);
      }
    };
    fetchTotalCount();
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      await fetchTags();
  
      const isFirstVisit = !localStorage.getItem('yupooScraper_hasVisited');
      const hasUrlTags = urlState.tags.length > 0;
      
      // Skip initial data fetch if we're on the similar search route
      if (location.pathname.startsWith('/similar/')) {
        return;
      }
      
      // If URL has tags, prioritize those over everything else
      if (hasUrlTags) {
        setSearchLoading(true);
        try {
          const tagsArray = urlState.tags;
          const params: any = { tags: tagsArray.join(',') };
          
          if (sortByColor.length > 0) {
            params.sort_by_colors = sortByColor.join(',');
          }
          
          const response = await axios.get<Product[]>(buildApiUrl('/api/products'), { params });
          setProducts(response.data);
          if (response.data.length === 0) {
            setSearchError('No products found with the specified tags');
          }
        } catch (err: any) {
          setSearchError(err?.response?.data?.detail || 'An error occurred while loading products');
        } finally {
          setSearchLoading(false);
        }
      } else if (isFirstVisit) {
        await handleViewAll({ isFirstVisit: true });
        localStorage.setItem('yupooScraper_hasVisited', 'true');
      } else {
        setSearchLoading(true);
        try {
          if (showViewAll) {
            const response = await axios.get<Product[]>(buildApiUrl('/api/products/all'));
            setProducts(response.data);
          } else if (selectedTags.size > 0) {
            const tagsArray = Array.from(selectedTags).join(',');
            const params: any = { tags: tagsArray };
            
            if (sortByColor.length > 0) {
              params.sort_by_colors = sortByColor.join(',');
            }
            
            const response = await axios.get<Product[]>(buildApiUrl('/api/products'), { params });
            setProducts(response.data);
            if (response.data.length === 0) {
              setSearchError('No products found with the restored tags');
            }
          }
        } catch (err: any) {
          setSearchError(err?.response?.data?.detail || 'An error occurred while restoring data');
        } finally {
          setSearchLoading(false);
        }
      }
    };
    
    fetchInitialData();
  }, []); // Runs only once on mount

  // Restore preview from URL ONLY if it's a shared link (no history in stack) and only once on mount
  useEffect(() => {
    if (urlState.preview && products.length > 0 && searchStateStack.length === 0 && !initialPreviewProcessed.current) {
      initialPreviewProcessed.current = true; // Mark as processed
      
      const productId = parseInt(urlState.preview, 10);
      const productIndex = products.findIndex(p => p.id === productId);
      
      if (productIndex >= 0) {
        const product = products[productIndex];
        
        // Calculate which page this product is on and navigate there
        const pageNumber = Math.floor(productIndex / itemsPerPage) + 1;
        if (location.pathname === '/' && pageNumber !== currentPage) {
          setCurrentPage(pageNumber);
          updateURLState({ page: pageNumber });
        }
        
        // Only auto-open preview if NOT on similar search route
        if (!location.pathname.startsWith('/similar/')) {
          const imageSrc = product.image_path ? buildImageUrl(product.image_path) : product.image_url;
          setPreviewImage(imageSrc);
          setPreviewTitle(product.album_title);
          setPreviewProductId(productId);
          setPreviewContext('home');
        } else {
          // On similar search route from shared link: scroll and highlight
          setTimeout(() => {
            const productCard = document.querySelector(`[data-product-id="${productId}"]`);
            if (productCard) {
              setHighlightedProductId(productId);
              productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Remove highlight after 2 seconds
              setTimeout(() => {
                setHighlightedProductId(null);
              }, 2000);
            }
          }, 100);
        }
      }
    }
  }, [urlState.preview, products, itemsPerPage, location.pathname, searchStateStack.length]);

  useEffect(() => {
    localStorage.setItem('yupooScraper_itemsPerPage', itemsPerPage.toString());
    localStorage.setItem('yupooScraper_mobileGridCols', mobileGridCols.toString());
    localStorage.setItem('yupooScraper_currentPage', currentPage.toString());
    localStorage.setItem('yupooScraper_selectedTags', JSON.stringify(Array.from(selectedTags)));
    localStorage.setItem('yupooScraper_showViewAll', String(showViewAll));
  }, [itemsPerPage, mobileGridCols, currentPage, selectedTags, showViewAll]);

  const fetchTags = async () => {
    setTagsLoading(true);
    try {
      const response = await axios.get<{ tags: string[] }>(buildApiUrl('/api/tags'));
      setAllTags(response.data.tags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setTagsLoading(false);
    }
  };

  // --- Main Actions ---

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated || !authToken) {
      setScrapeError('Authentication required');
      setShowLoginModal(true);
      updateURLState({ showLogin: true });
      return;
    }

    setScrapeError(null);
    setScrapeSuccess(null);
    setScrapingLoading(true);
    setScrapeLogs([]);
    setScrapeProgress(null);

    try {
      const trimmedUrl = scrapeUrl.trim();
      if (!trimmedUrl) {
        setScrapeError('Please enter a Yupoo URL');
        setScrapingLoading(false);
        return;
      }

      const response = await fetch(buildApiUrl('/api/scrape'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          base_url: trimmedUrl,
          max_albums: maxAlbums,
        }),
      });

      if (!response.ok) {
        throw new Error('Scraping failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: ScrapeProgress = JSON.parse(line.slice(6));
              setScrapeProgress(data);
              setScrapeLogs((prev) => [...prev, data]);

              if (data.type === 'complete') {
                setScrapeSuccess(
                  `✓ Scraping complete! Processed ${data.albums_processed} albums, inserted ${data.products_inserted} products.`
                );
                setScrapeUrl('');
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err: any) {
      setScrapeError(err?.message || 'An error occurred while scraping');
    } finally {
      setScrapingLoading(false);
    }
  };

  const performSearch = async (tagsToSearch: Set<string>) => {
    setSearchError(null);
    setSearchLoading(true);
    setProducts([]);
    
    try {
      if (tagsToSearch.size === 0) {
        setSearchLoading(false);
        // If no tags are selected, also clear sortByColor
        setSortByColor([]);
        return;
      }

      const tagsArray = Array.from(tagsToSearch).join(',');
      const params: any = { tags: tagsArray };
      
      if (sortByColor.length > 0) {
        params.sort_by_colors = sortByColor.join(',');
      }
      if (exclusiveTypeSearch) {
        params.exclusive_type_search = exclusiveTypeSearch;
      }
      
      const response = await axios.get<Product[]>(buildApiUrl('/api/products'), { params });
      setProducts(response.data);
      if (response.data.length === 0) {
        setSearchError('No products found with the selected tags');
      }
    } catch (err: any) {
      setSearchError(err?.response?.data?.detail || 'An error occurred while searching');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowViewAll(false);
    setCurrentPage(1);

    // Determine color tags from selectedTags for sorting
    const currentSelectedColorTags = Array.from(selectedTags).filter(tag => tag.startsWith('color_')).map(tag => tag.replace('color_', ''));
    setSortByColor(currentSelectedColorTags);

    // Update URL with selected tags
    if (selectedTags.size > 0) {
      const params = new URLSearchParams();
      params.set('tags', Array.from(selectedTags).join(','));
      navigate(`/?${params.toString()}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }

    await performSearch(selectedTags);
    
    // Scroll to results section
    setTimeout(() => {
      const resultsElement = document.getElementById('search-results');
      if (resultsElement) {
        const navbarHeight = 112;
        const y = resultsElement.getBoundingClientRect().top + window.scrollY - navbarHeight;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 100);
  };

  const toggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
    setCurrentPage(1); // Reset to page 1 when filtering changes
    setShowViewAll(false);

    // Automatically set sortByColor based on selected color tags
    const currentSelectedColorTags = Array.from(newSelected).filter(t => t.startsWith('color_')).map(t => t.replace('color_', ''));
    setSortByColor(currentSelectedColorTags);

    // Auto-search with the new tag selection
    setTimeout(() => {
      performSearch(newSelected);
    }, 0);
  };

  const clearSelectedTags = () => {
    setSelectedTags(new Set());
  };

  const handleViewAll = async (options: { isFirstVisit?: boolean, isRestoring?: boolean } = {}) => {
    const { isFirstVisit = false, isRestoring = false } = options;

    setSearchError(null);
    setSearchLoading(true);
    setShowViewAll(true);
    setProducts([]);
    
    if (!isFirstVisit && !isRestoring) {
      setCurrentPage(1);
      // Clear URL parameters when viewing all products
      navigate('/', { replace: true });
    }

    try {
      const response = await axios.get<Product[]>(buildApiUrl('/api/products/all'));
      setProducts(response.data);
      setTotalProductsCount(response.data.length);
      
      // Scroll to results section (not on first visit)
      if (!isFirstVisit && !isRestoring) {
        setTimeout(() => {
          const resultsElement = document.getElementById('search-results');
          if (resultsElement) {
            const navbarHeight = 112;
            const y = resultsElement.getBoundingClientRect().top + window.scrollY - navbarHeight;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (err: any) {
      setSearchError(err?.response?.data?.detail || 'An error occurred while fetching products');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!isAuthenticated || !authToken) {
      setClearDatabaseMessage('✗ Error: Authentication required');
      setShowLoginModal(true);
      updateURLState({ showLogin: true });
      return;
    }

    setShowClearDatabaseConfirm(true);
  };

  const confirmClearDatabase = async () => {
    setClearingDatabase(true);
    setClearDatabaseMessage(null);

    try {
      const response = await axios.delete(buildApiUrl('/api/database/clear'), {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      setClearDatabaseMessage(`✓ ${response.data.message}`);
      setProducts([]);
      setSelectedTags(new Set());
      
      await fetchTags();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setClearDatabaseMessage('✗ Error: Authentication expired. Please login again.');
        handleLogout();
        setShowLoginModal(true);
        updateURLState({ showLogin: true });
      } else {
        setClearDatabaseMessage(`✗ Error: ${err?.response?.data?.message || err?.message || 'Failed to clear database'}`);
      }
    } finally {
      setClearingDatabase(false);
    }
  };

  const onImageClick = useCallback((image: string, title: string, productId?: number) => {
    setHighlightedProductId(null);
    setPreviewImage(image);
    setPreviewTitle(title);
    setPreviewProductId(productId);
    setPreviewContext(location.pathname.startsWith('/lists') ? 'lists' : 'home');
    updateURLState({ preview: productId ? productId.toString() : null });
  }, [updateURLState, location.pathname]);

  const handlePreviewNavigate = useCallback((productId: number) => {
    setHighlightedProductId(null);
    const productsToUse = previewContext === 'lists' ? listProducts : products;
    const product = productsToUse.find(p => p.id === productId);
    if (product) {
      const imageSrc = product.image_path ? buildImageUrl(product.image_path) : product.image_url;
      setPreviewImage(imageSrc);
      setPreviewTitle(product.album_title);
      setPreviewProductId(productId);
      updateURLState({ preview: productId.toString() });
      
      // Only update page number if on home route, not on lists
      if (previewContext === 'home') {
        const productIndex = productsToUse.findIndex(p => p.id === productId);
        if (productIndex !== -1) {
          const correctPage = Math.floor(productIndex / itemsPerPage) + 1;
          if (correctPage !== currentPage) {
            setCurrentPage(correctPage);
          }
        }
      }
    }
  }, [products, listProducts, previewContext, itemsPerPage, currentPage, updateURLState]);

  const handleCloseWithHighlight = useCallback((productId: number) => {
    // Only handle page changes on home route, not lists
    if (previewContext !== 'home') {
      setPreviewImage(null);
      setPreviewTitle(null);
      setPreviewProductId(undefined);
      return;
    }
    
    // Find the product index in the products array
    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex === -1) return;
    
    // Calculate which page the product is on
    const productPage = Math.floor(productIndex / itemsPerPage) + 1;
    
    // Check if we need to navigate to a different page
    if (productPage !== currentPage) {
      // Change to the correct page first
      setCurrentPage(productPage);
      
      // Wait for the page change to complete, then scroll and highlight
      setTimeout(() => {
        const productCard = document.querySelector(`[data-product-id="${productId}"]`);
        if (productCard) {
          setHighlightedProductId(productId);
          productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Remove highlight after 2 seconds
          setTimeout(() => {
            setHighlightedProductId(null);
          }, 2000);
        }
      }, 100); // Small delay to ensure DOM has updated
    } else {
      // Product is on current page, check if it's in viewport
      const productCard = document.querySelector(`[data-product-id="${productId}"]`);
      if (!productCard) return;
      
      const rect = productCard.getBoundingClientRect();
      // Card is off screen if bottom is above viewport OR top is below viewport
      const isOffScreen = rect.bottom < 0 || rect.top > window.innerHeight;
      
      // Only highlight and scroll if off screen
      if (isOffScreen) {
        setHighlightedProductId(productId);
        productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Remove highlight after 2 seconds
        setTimeout(() => {
          setHighlightedProductId(null);
        }, 2000);
      }
    }
  }, [products, itemsPerPage, currentPage]);

  const handleSimilarSearch = async (product: Product, sameBrand: boolean) => {
    // Determine if we're on main page or similar search page
    const isOnMainPage = !location.pathname.startsWith('/similar/');
    
    if (isOnMainPage) {
      // Push main page state to stack
      setSearchStateStack(prev => [...prev, {
        type: 'main',
        products: [...products],
        selectedTags: new Set(selectedTags),
        showViewAll,
        currentPage,
        sortByColor: [...sortByColor],
        productId: product.id
      }]);
    } else {
      // Push current similar search state to stack
      const currentSimilarProductId = location.pathname.split('/').pop();
      const currentSameBrand = new URLSearchParams(location.search).get('sameBrand') === 'true';
      
      setSearchStateStack(prev => [...prev, {
        type: 'similar',
        products: [...products],
        selectedTags: new Set(selectedTags),
        showViewAll: false,
        currentPage,
        sortByColor: [...sortByColor],
        productId: product.id,
        similarProductId: parseInt(currentSimilarProductId || '0'),
        sameBrand: currentSameBrand
      }]);
    }

    // Build route with preserved URL state for sharing/history
    const currentParams = new URLSearchParams(location.search);
    // Clear sameBrand first, then set if needed
    currentParams.delete('sameBrand');
    if (sameBrand) {
      currentParams.set('sameBrand', 'true');
    }
    const queryString = currentParams.toString();
    const route = queryString ? `/similar/${product.id}?${queryString}` : `/similar/${product.id}`;
    
    navigationInitiatedByUs.current = true; // Mark that we initiated this navigation
    navigate(route);
  };

  const handleBackToPreviousResults = () => {
    if (searchStateStack.length > 0) {
      // Pop the last state from stack
      const previousState = searchStateStack[searchStateStack.length - 1];
      setSearchStateStack(prev => prev.slice(0, -1));
      
      // Restore state from stack
      setProducts(previousState.products);
      setSelectedTags(previousState.selectedTags);
      setShowViewAll(previousState.showViewAll);
      setCurrentPage(previousState.currentPage);
      setSortByColor(previousState.sortByColor);
      setSearchError(null);
      
      if (previousState.type === 'main') {
        // Navigate back to main page
        setIsInSimilarSearchMode(false);
        
        // Build URL with preserved state
        const params = new URLSearchParams();
        if (previousState.selectedTags.size > 0) {
          params.set('tags', Array.from(previousState.selectedTags).join(','));
        }
        if (previousState.currentPage > 1) {
          params.set('page', previousState.currentPage.toString());
        }
        const queryString = params.toString();
        const targetUrl = queryString ? `/?${queryString}` : '/';
        
        setTimeout(() => {
          navigationInitiatedByUs.current = true; // Mark that we initiated this navigation
          navigate(targetUrl);
          
          // Scroll to and highlight the product that triggered the similar search
          setTimeout(() => {
            const productCard = document.querySelector(`[data-product-id="${previousState.productId}"]`);
            if (productCard) {
              setHighlightedProductId(previousState.productId);
              productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              setTimeout(() => {
                setHighlightedProductId(null);
              }, 2000);
            }
          }, 100);
        }, 50);
      } else {
        // Navigate back to previous similar search page (on the /similar/ route)
        setIsInSimilarSearchMode(true);
        
        // Build URL with preserved state for similar search
        const params = new URLSearchParams();
        // Preserve original tags and params from when this similar search was made
        if (previousState.selectedTags.size > 0) {
          params.set('tags', Array.from(previousState.selectedTags).join(','));
        }
        if (previousState.sameBrand) {
          params.set('sameBrand', 'true');
        }
        const queryString = params.toString();
        const targetUrl = queryString 
          ? `/similar/${previousState.similarProductId}?${queryString}` 
          : `/similar/${previousState.similarProductId}`;
        
        setTimeout(() => {
          navigationInitiatedByUs.current = true; // Mark that we initiated this navigation
          navigate(targetUrl);
          
          // Scroll to and highlight the product that triggered the next similar search
          setTimeout(() => {
            const productCard = document.querySelector(`[data-product-id="${previousState.productId}"]`);
            if (productCard) {
              setHighlightedProductId(previousState.productId);
              productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              setTimeout(() => {
                setHighlightedProductId(null);
              }, 2000);
            }
          }, 100);
        }, 50);
      }
    } else {
      // No state in memory - user opened shared link directly
      // Parse URL params from current location to restore state
      const params = new URLSearchParams(location.search);
      const tags = params.get('tags')?.split(',').filter(Boolean) || [];
      const page = parseInt(params.get('page') || '1', 10);
      const preview = params.get('preview');
      
      // Restore tags to state
      if (tags.length > 0) {
        setSelectedTags(new Set(tags));
      }
      
      // Build target URL preserving the original state
      const targetParams = new URLSearchParams();
      if (tags.length > 0) targetParams.set('tags', tags.join(','));
      if (page > 1) targetParams.set('page', page.toString());
      if (preview) targetParams.set('preview', preview);
      
      const queryString = targetParams.toString();
      const targetUrl = queryString ? `/?${queryString}` : '/';
      
      setIsInSimilarSearchMode(false);
      navigationInitiatedByUs.current = true; // Mark that we initiated this navigation
      navigate(targetUrl);
    }
  };

  return (
    <div className="min-h-screen safe-area" style={{ backgroundColor: 'var(--bg-color)' }}>
      <NavigationBar 
        onSettingsClick={() => {
          setShowSettingsModal(true);
          updateURLState({ showSettings: true });
        }}
        isAuthenticated={isAuthenticated}
        username={username}
        isAdmin={isAdmin}
        onLoginClick={handleLoginClick}
        onLogoutClick={handleLogout}
      />
      <Routes>
        <Route path="/preview=:productId" element={
          <PreviewRedirect 
            products={products}
            itemsPerPage={itemsPerPage}
            setCurrentPage={setCurrentPage}
            setPreviewImage={setPreviewImage}
            setPreviewTitle={setPreviewTitle}
            setPreviewProductId={setPreviewProductId}
            setPreviewContext={setPreviewContext}
            navigate={navigate}
          />
        } />
        <Route path="/similar/:productId" element={
          <SimilarSearchPage
            setProducts={setProducts}
            setSearchLoading={setSearchLoading}
            setSearchError={setSearchError}
            setIsInSimilarSearchMode={setIsInSimilarSearchMode}
            searchLoading={searchLoading}
            searchError={searchError}
            products={products}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            mobileGridCols={mobileGridCols}
            setMobileGridCols={setMobileGridCols}
            onImageClick={(image, title, productId) => {
              onImageClick(image, title, productId);
              // Update preview in URL
              if (productId) {
                updateURLState({ preview: productId.toString() });
              }
            }}
            onBackToPreviousResults={handleBackToPreviousResults}
            highlightedProductId={highlightedProductId}
            isAuthenticated={isAuthenticated}
            authToken={authToken}
            onLoginRequired={() => {
              setShowLoginModal(true);
              updateURLState({ showLogin: true });
            }}
          />
        } />
        <Route path="/" element={
          <div className="container px-0 py-8 pt-40 mx-auto md:pt-28">
            <MainContent
                      tagsLoading={tagsLoading}
                      allTags={allTags}
                      selectedTags={selectedTags}
                      toggleTag={toggleTag}
                      clearSelectedTags={clearSelectedTags}
                      colorSearchQuery={colorSearchQuery}
                      setColorSearchQuery={setColorSearchQuery}
                      typeSearchQuery={typeSearchQuery}
                      setTypeSearchQuery={setTypeSearchQuery}
                      brandSearchQuery={brandSearchQuery}
                      setBrandSearchQuery={setBrandSearchQuery}
                      handleSearch={handleSearch}
                      handleSimilarSearch={handleSimilarSearch}
                      searchLoading={searchLoading}
                      searchError={searchError}
                      isInSimilarSearchMode={isInSimilarSearchMode}
                      onBackToPreviousResults={handleBackToPreviousResults}
                      Array={Array}
                      sortByColor={sortByColor}
                      setSortByColor={setSortByColor}
                      products={products}
                      showViewAll={showViewAll}
                      totalProductsCount={totalProductsCount}
                      currentPage={currentPage}
                      setCurrentPage={setCurrentPage}
                      itemsPerPage={itemsPerPage}
                      setItemsPerPage={setItemsPerPage}
                      mobileGridCols={mobileGridCols}
                      setMobileGridCols={setMobileGridCols}
                      onImageClick={onImageClick}
                      handleViewAll={handleViewAll}
                      scrapeProgress={scrapeProgress}
                      exclusiveTypeSearch={exclusiveTypeSearch}
                      setExclusiveTypeSearch={setExclusiveTypeSearch}
                      performSearch={performSearch}
                      highlightedProductId={highlightedProductId}
                      isAuthenticated={isAuthenticated}
                      authToken={authToken}
                      onLoginRequired={() => {
                        setShowLoginModal(true);
                        updateURLState({ showLogin: true });
                      }}
                    />
          </div>
        } />
        <Route path="/lists" element={
          <div className="container px-0 py-8 pt-40 mx-auto md:pt-28">
            <MyLists
                      authToken={authToken}
                      isAuthenticated={isAuthenticated}
                      onLoginRequired={() => {
                        setShowLoginModal(true);
                        updateURLState({ showLogin: true });
                      }}
                      onImageClick={onImageClick}
                      onSimilarSearch={handleSimilarSearch}
                      mobileGridCols={mobileGridCols}
                      setMobileGridCols={setMobileGridCols}
                      onListProductsChange={setListProducts}
                    />
          </div>
        } />
        <Route path="/lists/:listName" element={
          <div className="container px-0 py-8 pt-40 mx-auto md:pt-28">
            <MyLists
                      authToken={authToken}
                      isAuthenticated={isAuthenticated}
                      onLoginRequired={() => {
                        setShowLoginModal(true);
                        updateURLState({ showLogin: true });
                      }}
                      onImageClick={onImageClick}
                      onSimilarSearch={handleSimilarSearch}
                      mobileGridCols={mobileGridCols}
                      setMobileGridCols={setMobileGridCols}
                      onListProductsChange={setListProducts}
                    />
          </div>
        } />
        <Route path="/scraper" element={
          <div className="container px-0 py-8 pt-40 mx-auto md:pt-28">
            <ScraperGUI 
                      scrapeUrl={scrapeUrl}
                      setScrapeUrl={setScrapeUrl}
                      maxAlbums={maxAlbums}
                      setMaxAlbums={setMaxAlbums}
                      sliderValue={sliderValue}
                      setSliderValue={setSliderValue}
                      scrapingLoading={scrapingLoading}
                      scrapeError={scrapeError}
                      scrapeSuccess={scrapeSuccess}
                      scrapeProgress={scrapeProgress}
                      scrapeLogs={scrapeLogs}
                      handleScrape={handleScrape}
                      exponentialSliderToValue={exponentialSliderToValue}
                      handleClearDatabase={handleClearDatabase}
                      clearingDatabase={clearingDatabase}
                      clearDatabaseMessage={clearDatabaseMessage}
                      authToken={authToken}
                    />
          </div>
        } />
          </Routes>
          
          {previewImage && (
          <ImagePreview 
            image={previewImage}
            title={previewTitle}
            onClose={() => {
              setPreviewImage(null);
              setPreviewTitle(null);
              setPreviewProductId(undefined);
              // Only update URL state if NOT navigating to similar route
              // Check the current location at close time
              if (!window.location.pathname.startsWith('/similar/')) {
                updateURLState({ preview: null });
              }
            }}
            products={previewContext === 'lists' ? listProducts : products}
            currentProductId={previewProductId}
            onNavigate={handlePreviewNavigate}
            onCloseWithHighlight={handleCloseWithHighlight}
            onSimilarSearch={handleSimilarSearch}
            isAuthenticated={isAuthenticated}
            authToken={authToken}
            onLoginRequired={() => {
              setShowLoginModal(true);
              updateURLState({ showLogin: true });
            }}
            allProducts={products}
            itemsPerPage={itemsPerPage}
          />
        )}

      {/* Clear Database Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearDatabaseConfirm}
        onClose={() => setShowClearDatabaseConfirm(false)}
        onConfirm={confirmClearDatabase}
        title="⚠️ Clear Database"
        message="WARNING: This will permanently delete ALL products from the database. This action cannot be undone. Are you absolutely sure?"
        confirmText="Delete Everything"
        cancelText="Cancel"
        isDanger={true}
      />

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDanger={false}
      />

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDanger={false}
      />

      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => {
          setShowSettingsModal(false);
          updateURLState({ showSettings: false });
        }}
      />
      <LoginModal
        show={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          updateURLState({ showLogin: false, showSignup: false });
        }}
        onLoginSuccess={handleLoginSuccess}
        isSignupMode={isSignupMode}
        onToggleMode={(isSignup) => {
          setIsSignupMode(isSignup);
          updateURLState({ showLogin: !isSignup, showSignup: isSignup });
        }}
      />
    </div>
  );
};

export default App;