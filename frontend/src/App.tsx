import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import axios from 'axios';
import ImagePreview from './ImagePreview';
import ProductCard from './ProductCard';
import Pagination from './Pagination';
import NavigationBar from './NavigationBar';
import Settings from './Settings';
import { useSettings } from './SettingsContext';
import ScraperGUI from './ScraperGUI';
import { Product, TagCategory, formatTag } from './types';



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
  const value = 1 + 9999 * (normalized * normalized);
  return Math.max(1, Math.min(10000, Math.round(value)));
};

const valueToExponentialSlider = (value: number): number => {
  const clampedValue = Math.max(1, Math.min(10000, value));
  if (clampedValue === 1) return 0;
  const sliderValue = Math.sqrt((clampedValue - 1) / 9999) * 100;
  return Math.max(0, Math.min(100, sliderValue));
};


const App: React.FC = () => {
  const { settings } = useSettings();
  // Scraping state
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [maxAlbums, setMaxAlbums] = useState(50);
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
  const [sortByColor, setSortByColor] = useState<string | null>(null);  // Color to sort by
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);

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
    return isFirstVisit ? 50 : 50; // Default to 50
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

  
  // --- Core Data Loading and State Persistence ---

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
            const response = await axios.get<Product[]>(`/api/products/all`);
            setProducts(response.data);
          } else if (selectedTags.size > 0) {
            const tagsArray = Array.from(selectedTags).join(',');
            const params: any = { tags: tagsArray };
            
            const colorTags = Array.from(selectedTags).filter(tag => tag.startsWith('color_'));
            if (colorTags.length > 0 && sortByColor) {
              params.sort_by_color = sortByColor;
            }
            
            const response = await axios.get<Product[]>(`/api/products`, { params });
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
      const response = await axios.get<{ tags: string[] }>(`/api/tags`);
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

      const response = await fetch(`/api/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        return;
      }

      const tagsArray = Array.from(tagsToSearch).join(',');
      const params: any = { tags: tagsArray };
      
      const colorTags = Array.from(tagsToSearch).filter(tag => tag.startsWith('color_'));
      if (colorTags.length > 0 && sortByColor) {
        params.sort_by_color = sortByColor;
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
    await performSearch(selectedTags);
  };

  const toggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
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
    } catch (err: any) {
      setSearchError(err?.response?.data?.detail || 'An error occurred while fetching products');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('⚠️ WARNING: This will delete ALL products from the database. Are you sure?')) {
      return;
    }

    setClearingDatabase(true);
    setClearDatabaseMessage(null);

    try {
      const response = await axios.delete(`/api/database/clear`);
      setClearDatabaseMessage(`✓ ${response.data.message}`);
      setProducts([]);
      setSelectedTags(new Set());
      
      await fetchTags();
    } catch (err: any) {
      setClearDatabaseMessage(`✗ Error: ${err?.response?.data?.message || err?.message || 'Failed to clear database'}`);
    } finally {
      setClearingDatabase(false);
    }
  };

  const onImageClick = useCallback((image: string, title: string) => {
    setPreviewImage(image);
    setPreviewTitle(title);
  }, []);

  const MainContent: React.FC = () => (
    <>
      {settings.showScraperGui && (
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
        />
      )}

      <div className="max-w-4xl p-8 mx-auto mb-8 bg-white rounded-lg shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-gray-800">Search Products by Tags</h2>
        {tagsLoading ? (
          <div className="py-6 text-center"><p className="text-gray-500">Loading available tags...</p></div>
        ) : (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-700">Available Tags</h3>
                {selectedTags.size > 0 && (
                  <button onClick={clearSelectedTags} className="text-sm font-medium text-red-600 hover:text-red-800">
                    Clear all ({selectedTags.size} selected)
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {(() => {
                  const categories: TagCategory = { color: [], type: [], company: [] };
                  allTags.forEach(tag => {
                    if (tag.startsWith('color_')) categories.color.push(tag);
                    else if (tag.startsWith('type_')) categories.type.push(tag);
                    else if (tag.startsWith('company_')) categories.company.push(tag);
                  });
                  const categoryInfo: Array<[keyof TagCategory, string, string]> = [
                    ['color', 'Color', 'bg-purple-200 text-purple-900'],
                    ['type', 'Type', 'bg-blue-200 text-blue-900'],
                    ['company', 'Brand', 'bg-red-200 text-red-900'],
                  ];
                  return categoryInfo.map(([cat, label, bgColor]) =>
                    categories[cat].length > 0 ? (
                      <div key={cat}>
                        <p className="mb-2 text-sm font-semibold text-gray-700">{label}:</p>
                        <div className="flex flex-wrap gap-2">
                          {categories[cat].map((tag) => (
                            <button
                              key={tag}
                              onClick={() => toggleTag(tag)}
                              className={`px-3 py-1 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                                selectedTags.has(tag)
                                  ? `${bgColor} shadow-lg scale-105 border-2 border-gray-800`
                                  : `${bgColor} hover:opacity-80 border border-gray-300`
                              }`}
                            >
                              {formatTag(tag)}
                              {selectedTags.has(tag) && ' ✓'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null
                  );
                })()}
              </div>
            </div>
            <form onSubmit={handleSearch} className="space-y-4">
              <button
                type="submit"
                disabled={searchLoading || selectedTags.size === 0}
                className="w-full py-3 font-semibold text-white transition-colors bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {searchLoading ? '🔍 Searching...' : `🔍 Search (${selectedTags.size} tags selected)`}
              </button>
            </form>
            {Array.from(selectedTags).some(tag => tag.startsWith('color_')) && (
              <div className="p-4 mt-4 border border-blue-200 rounded-lg bg-blue-50">
                <h3 className="mb-3 text-sm font-semibold text-blue-900">🎨 Sort by Color Intensity</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const colorTag = Array.from(selectedTags).find(tag => tag.startsWith('color_'));
                      if (colorTag) {
                        const colorName = colorTag.replace('color_', '');
                        setSortByColor(colorName);
                      }
                    }}
                    className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                      sortByColor ? 'bg-blue-600 text-white' : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    ⬇️ Most to Least {Array.from(selectedTags).find(tag => tag.startsWith('color_'))?.replace('color_', '').toUpperCase()}
                  </button>
                  {sortByColor && (
                    <button onClick={() => setSortByColor(null)} className="w-full px-3 py-2 text-sm font-medium text-gray-700 transition-colors bg-gray-100 rounded hover:bg-gray-200">
                      ✕ Clear Sorting
                    </button>
                  )}
                </div>
              </div>
            )}
            {searchError && <div className="p-4 mt-4 text-red-700 border border-red-200 rounded-lg bg-red-50">⚠️ {searchError}</div>}
            <div className="pt-6 mt-6 border-t border-gray-200">
              <h3 className="mb-4 text-lg font-semibold text-gray-700">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={handleViewAll}
                  disabled={searchLoading}
                  className="w-full py-3 font-semibold text-white transition-colors bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {searchLoading ? '⏳ Loading...' : `📋 View All Products (${products.length > 0 ? products.length : '?'})`}
                </button>
                <button
                  onClick={handleClearDatabase}
                  disabled={clearingDatabase}
                  className="w-full py-3 font-semibold text-white transition-colors bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                >
                  {clearingDatabase ? '⏳ Clearing...' : '🗑️ Clear Database'}
                </button>
                {clearDatabaseMessage && (
                  <div className={`p-3 rounded-lg text-sm font-medium ${
                    clearDatabaseMessage.startsWith('✓')
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}>
                    {clearDatabaseMessage}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {products.length > 0 && (() => {
          const indexOfLastItem = currentPage * itemsPerPage;
          const indexOfFirstItem = indexOfLastItem - itemsPerPage;
          const currentItems = products.slice(indexOfFirstItem, indexOfLastItem);
          const totalPages = Math.ceil(products.length / itemsPerPage);
          let gridClass: string;
          switch(mobileGridCols) {
              case 3: gridClass = 'grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6'; break;
              case 2: gridClass = 'grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4'; break;
              case 1: default: gridClass = 'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
          }
          return (
            <div className="mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {showViewAll ? `All Products (${products.length})` : `Search Results (${products.length})`}
                </h2>
                <div className="flex flex-wrap items-center justify-end flex-grow gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2 p-1 bg-gray-200 rounded-lg sm:hidden">
                    <button onClick={() => setMobileGridCols(1)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${mobileGridCols === 1 ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>1</button>
                    <button onClick={() => setMobileGridCols(2)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${mobileGridCols === 2 ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>2</button>
                    <button onClick={() => setMobileGridCols(3)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${mobileGridCols === 3 ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>3</button>
                  </div>
                  <div>
                    <label htmlFor="itemsPerPage" className="mr-2 text-sm font-medium text-gray-700">Show:</label>
                    <select 
                        id="itemsPerPage" 
                        value={itemsPerPage} 
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                        className="p-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                        <option value={500}>500</option>
                    </select>
                  </div>
                  <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </div>
              </div>
              <div className={gridClass}>
                {currentItems.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onImageClick={onImageClick}
                    mobileGridCols={mobileGridCols}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </div>
              )}
            </div>
          );
      })()}

      {products.length === 0 && !searchLoading && !scrapingLoading && (
        <div className="py-12 text-center">
          <p className="text-lg text-gray-500">
            Search for products by tags or view all available products.
          </p>
        </div>
      )}

      {searchLoading && !scrapeProgress && (
        <div className="py-12 text-center">
          <div className="inline-block">
            <div className="w-12 h-12 border-b-2 border-blue-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Loading products...</p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <NavigationBar />
      <div className="container px-4 py-8 pt-40 mx-auto md:pt-28">
        <Routes>
          <Route path="/" element={<MainContent />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        {previewImage && (
          <ImagePreview 
            image={previewImage}
            title={previewTitle}
            onClose={() => {
              setPreviewImage(null);
              setPreviewTitle(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default App;