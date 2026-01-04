import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import ImagePreview from './ImagePreview';
import NavigationBar from './NavigationBar';
import { useSettings, SettingsModal } from './SettingsContext';
import ScraperGUI from './ScraperGUI';
import MainContent from './MainContent';
import LoginModal from './LoginModal';
import MyLists from './MyLists';
import { Product, TagCategory } from './types';
import { buildApiUrl } from './api-config';



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


const App: React.FC = () => {
  const { settings } = useSettings();
  const [currentTab, setCurrentTab] = useState<'home' | 'scraper' | 'lists'>('home');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
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
  const [sortByColor, setSortByColor] = useState<string[]>([]);  // Color(s) to sort by
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true); // Re-added tagsLoading state
  const [exclusiveTypeSearch, setExclusiveTypeSearch] = useState<boolean>(false);

  // --- State with localStorage Persistence ---
  const [showViewAll, setShowViewAll] = useState(() => localStorage.getItem('yupooScraper_showViewAll') === 'true');
  
  const [selectedTags, setSelectedTags] = useState(() => {
    const saved = localStorage.getItem('yupooScraper_selectedTags');
    return saved ? new Set(JSON.parse(saved)) : new Set<string>();
  });
  
  const [currentPage, setCurrentPage] = useState(() => {
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

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [previewProductId, setPreviewProductId] = useState<number | undefined>(undefined);
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);

  
  // --- Core Data Loading and State Persistence ---

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
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    setAuthToken(null);
    setIsAuthenticated(false);
    setUsername('');
    setIsAdmin(false);
    setCurrentTab('home');
  };

  const handleLoginClick = () => {
    setShowLoginModal(true);
  };

  // Protect scraper tab - only admins can access
  useEffect(() => {
    if (currentTab === 'scraper' && !isAdmin) {
      setCurrentTab('home');
      if (!isAuthenticated) {
        setShowLoginModal(true);
      }
    }
  }, [currentTab, isAdmin, isAuthenticated]);

  useEffect(() => {
    const fetchInitialData = async () => {
      await fetchTags();
  
      const isFirstVisit = !localStorage.getItem('yupooScraper_hasVisited');
      
      if (isFirstVisit) {
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
      
      const response = await axios.get<Product[]>(`/api/products`, { params });
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
    }

    try {
      const response = await axios.get<Product[]>(`/api/products/all`);
      setProducts(response.data);
      
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
      return;
    }

    if (!window.confirm('⚠️ WARNING: This will delete ALL products from the database. Are you sure?')) {
      return;
    }

    setClearingDatabase(true);
    setClearDatabaseMessage(null);

    try {
      const response = await axios.delete(`/api/database/clear`, {
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
  }, []);

  const handlePreviewNavigate = useCallback((productId: number) => {
    setHighlightedProductId(null);
    const product = products.find(p => p.id === productId);
    if (product) {
      const imageSrc = product.image_path ? product.image_path : product.image_url;
      setPreviewImage(imageSrc);
      setPreviewTitle(product.album_title);
      setPreviewProductId(productId);
    }
  }, [products]);

  const handleCloseWithHighlight = useCallback((productId: number) => {
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

  const handleSimilarSearch = (product: Product, sameBrand: boolean) => {
    const newSelected = new Set<string>();
    const colorTags = product.tags.filter(tag => tag.startsWith('color_'));
    const typeTags = product.tags.filter(tag => tag.startsWith('type_'));

    colorTags.forEach(tag => newSelected.add(tag));
    typeTags.forEach(tag => newSelected.add(tag));

    if (sameBrand) {
        const brandTags = product.tags.filter(tag => tag.startsWith('company_'));
        brandTags.forEach(tag => newSelected.add(tag));
    }

    setSelectedTags(newSelected);
    setCurrentPage(1);
    setShowViewAll(false);

    const currentSelectedColorTags = Array.from(newSelected).filter(t => t.startsWith('color_')).map(t => t.replace('color_', ''));
    setSortByColor(currentSelectedColorTags);

    performSearch(newSelected);
};

  return (
    <div className="min-h-screen safe-area">
      <NavigationBar 
        currentTab={currentTab} 
        setCurrentTab={setCurrentTab}
        onSettingsClick={() => setShowSettingsModal(true)}
        isAuthenticated={isAuthenticated}
        username={username}
        isAdmin={isAdmin}
        onLoginClick={handleLoginClick}
        onLogoutClick={handleLogout}
      />
      <div className="container px-0 py-8 pt-40 mx-auto md:pt-28">
        {currentTab === 'home' ? (
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
                      Array={Array}
                      sortByColor={sortByColor}
                      setSortByColor={setSortByColor}
                      products={products}
                      showViewAll={showViewAll}
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
                      onLoginRequired={() => setShowLoginModal(true)}
                    />
                  ) : currentTab === 'lists' ? (
                    <MyLists
                      authToken={authToken}
                      isAuthenticated={isAuthenticated}
                      onLoginRequired={() => setShowLoginModal(true)}
                      onImageClick={onImageClick}
                    />
                  ) : (
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
        )}
        {previewImage && (
          <ImagePreview 
            image={previewImage}
            title={previewTitle}
            onClose={() => {
              setPreviewImage(null);
              setPreviewTitle(null);
              setPreviewProductId(undefined);
            }}
            products={products}
            currentProductId={previewProductId}
            onNavigate={handlePreviewNavigate}
            onCloseWithHighlight={handleCloseWithHighlight}
            onSimilarSearch={handleSimilarSearch}
            isAuthenticated={isAuthenticated}
            authToken={authToken}
            onLoginRequired={() => setShowLoginModal(true)}
          />
        )}
      </div>
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)}
      />
      <LoginModal
        show={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
};

export default App;