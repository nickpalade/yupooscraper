import React, { useRef } from 'react';
import { Search, Eye, Trash2, Loader } from 'lucide-react'; // Removed BarChart3
import TagSearchSection from './TagSearchSection';
import ProductCard from './ProductCard';
import Pagination from './Pagination';
import { Product } from './types';

interface MainContentProps {
  tagsLoading: boolean;
  allTags: string[];
  selectedTags: Set<string>;
  toggleTag: (tag: string) => void;
  clearSelectedTags: () => void;
  colorSearchQuery: string;
  setColorSearchQuery: (query: string) => void;
  typeSearchQuery: string;
  setTypeSearchQuery: (query: string) => void;
  brandSearchQuery: string;
  setBrandSearchQuery: (query: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  handleSimilarSearch: (product: Product, sameBrand: boolean) => void;
  searchLoading: boolean;
  searchError: string | null;
  Array: any;
  sortByColor: string[]; // Changed from string | null to string[]
  setSortByColor: (color: string[]) => void; // Changed from string | null to string[]
  products: Product[];
  showViewAll: boolean;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  setItemsPerPage: (items: number) => void;
  mobileGridCols: number;
  setMobileGridCols: (cols: number) => void;
  onImageClick: (image: string, title: string, productId?: number) => void;
  handleViewAll: () => void;
  scrapeProgress: any;
  exclusiveTypeSearch: boolean;
  setExclusiveTypeSearch: (exclusive: boolean) => void;
  performSearch: (tagsToSearch: Set<string>) => Promise<void>;
  highlightedProductId?: number | null;
}

const MainContent: React.FC<MainContentProps> = ({
  tagsLoading,
  allTags,
  selectedTags,
  toggleTag,
  clearSelectedTags,
  colorSearchQuery,
  setColorSearchQuery,
  typeSearchQuery,
  setTypeSearchQuery,
  brandSearchQuery,
  setBrandSearchQuery,
  handleSearch,
  handleSimilarSearch,
  searchLoading,
  searchError,
  sortByColor,
  setSortByColor,
  products,
  showViewAll,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  mobileGridCols,
  setMobileGridCols,
  onImageClick,
  handleViewAll,
  scrapeProgress,
  exclusiveTypeSearch,
  setExclusiveTypeSearch,
  performSearch,
  highlightedProductId,
}) => {
  const resultsRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = React.useState(false);
  const [animatedItems, setAnimatedItems] = React.useState<Set<number>>(new Set());
  const [instantItems, setInstantItems] = React.useState<Set<number>>(new Set());
  const scrollTimeoutRef = useRef<number | null>(null);

  const handlePageChange = (page: number) => {
    if (resultsRef.current) {
      const { top } = resultsRef.current.getBoundingClientRect();
      const navbarHeight = 112;
      const scrollThreshold = 200;

      // Check if we need to scroll
      const needsScrolling = top < 0 || top > window.innerHeight - scrollThreshold;

      if (needsScrolling) {
        // Set scrolling state
        setIsScrolling(true);
        
        const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - navbarHeight;
        window.scrollTo({ top: y, behavior: 'smooth' });

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Wait for scroll to finish before changing page
        scrollTimeoutRef.current = window.setTimeout(() => {
          setIsScrolling(false);
          setCurrentPage(page);
          setAnimatedItems(new Set());
          setInstantItems(new Set());
        }, 800); // Smooth scroll typically takes 500-800ms
      } else {
        // No scrolling needed, change page immediately
        setCurrentPage(page);
        setAnimatedItems(new Set());
        setInstantItems(new Set());
      }
    } else {
      // No resultsRef, just change page
      setCurrentPage(page);
      setAnimatedItems(new Set());
      setInstantItems(new Set());
    }
  };

  // Calculate which items are visible and should be animated
  React.useEffect(() => {
    if (products.length === 0) return;

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = products.slice(indexOfFirstItem, indexOfLastItem);

    const observer = new IntersectionObserver(
      (entries) => {
        const viewportHeight = window.innerHeight;
        const bufferSpace = viewportHeight * 2; // Two full screens as buffer

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0', 10);
            const rect = entry.target.getBoundingClientRect();
            
            // Check if item is within viewport + buffer (should animate)
            if (rect.top < viewportHeight + bufferSpace) {
              setAnimatedItems((prev) => {
                const newSet = new Set(prev);
                newSet.add(index);
                return newSet;
              });
              
              // Check if this is the last visible item in the extended viewport
              if (rect.bottom > viewportHeight + bufferSpace) {
                // Load all remaining items instantly (no animation)
                setInstantItems((prev) => {
                  const newSet = new Set(prev);
                  for (let i = index + 1; i < currentItems.length; i++) {
                    newSet.add(i);
                  }
                  return newSet;
                });
              }
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '200%', // Two full screens buffer
        threshold: 0.01,
      }
    );

    // Start observing all product cards
    const cards = document.querySelectorAll('[data-product-card]');
    cards.forEach((card) => observer.observe(card));

    return () => {
      observer.disconnect();
    };
  }, [currentPage, products, itemsPerPage]);

  // Cleanup scroll timeout on unmount
  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl p-4 mx-auto mb-8 glass-container md:p-6 lg:p-8">
          <h2 className="mb-6 text-2xl font-bold" style={{ color: 'var(--text-color)' }}>Search Products by Tags</h2>
        {tagsLoading ? (
          <div className="py-6 text-center"><p style={{ color: 'var(--text-color)' }}>Loading available tags...</p></div>
        ) : (
          <>
            <TagSearchSection
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
              exclusiveTypeSearch={exclusiveTypeSearch}
              setExclusiveTypeSearch={setExclusiveTypeSearch}
              performSearch={performSearch}
            />

            <form onSubmit={handleSearch} className="space-y-4">
              <button
                type="submit"
                disabled={searchLoading || selectedTags.size === 0}
                className="flex items-center justify-center w-full gap-2 py-3 font-semibold text-white transition-all glass-button"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #4f46e5 0%, #a855f7 50%, #6366f1 100%)',
                  color: 'var(--button-text)',
                  borderColor: 'var(--glass-border)',
                }}
              >
                <Search size={20} />
                {searchLoading ? 'Searching...' : `Search (${selectedTags.size} tags selected)`}
              </button>
            </form>

            {searchError && <div className="flex items-center gap-2 p-4 mt-4 rounded-lg" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}>⚠️ {searchError}</div>}
            <div className="pt-6 mt-6" style={{ borderColor: 'var(--border-color)', borderTopWidth: '1px' }}>
              <h3 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-color)' }}>Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={handleViewAll}
                  disabled={searchLoading}
                  className="flex items-center justify-center w-full gap-2 py-3 font-semibold text-white transition-all glass-button"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #4f46e5 0%, #a855f7 50%, #6366f1 100%)',
                    color: 'var(--button-text)',
                    borderColor: 'var(--glass-border)',
                  }}
                >
                  <Eye size={20} />
                  {searchLoading ? 'Loading...' : `View All Products (${products.length > 0 ? products.length : '?'})`}
                </button>
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
          <div className="mb-8" ref={resultsRef}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-color)' }}>
                {showViewAll ? `All Products (${products.length})` : `Search Results (${products.length})`}
              </h2>
              <div className="flex flex-wrap items-center justify-end flex-grow gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 p-1 rounded-lg md:hidden" style={{ backgroundColor: 'var(--card-bg)' }}>
                  <span className="ml-2 text-sm font-medium font-semibold" style={{ color: 'var(--text-color)' }}>WIDTH:</span>
                  <button onClick={() => setMobileGridCols(1)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors glass-button ${mobileGridCols === 1 ? 'shadow' : ''}`} style={{ backgroundColor: mobileGridCols === 1 ? 'var(--primary-color)' : 'transparent', color: mobileGridCols === 1 ? 'var(--button-text)' : 'var(--text-color)', borderColor: 'var(--glass-border)' }}>1</button>
                  <button onClick={() => setMobileGridCols(2)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors glass-button ${mobileGridCols === 2 ? 'shadow' : ''}`} style={{ backgroundColor: mobileGridCols === 2 ? 'var(--primary-color)' : 'transparent', color: mobileGridCols === 2 ? 'var(--button-text)' : 'var(--text-color)', borderColor: 'var(--glass-border)' }}>2</button>
                  <button onClick={() => setMobileGridCols(3)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors glass-button ${mobileGridCols === 3 ? 'shadow' : ''}`} style={{ backgroundColor: mobileGridCols === 3 ? 'var(--primary-color)' : 'transparent', color: mobileGridCols === 3 ? 'var(--button-text)' : 'var(--text-color)', borderColor: 'var(--glass-border)' }}>3</button>
                </div>
                <div>
                  <label htmlFor="itemsPerPage" className="mr-2 text-sm font-medium" style={{ color: 'var(--text-color)' }}>Show:</label>
                  <select 
                    id="itemsPerPage" 
                    value={itemsPerPage} 
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="p-2 rounded-lg focus:outline-none focus:ring-2 glass-input"
                    style={{ 
                      color: 'var(--input-text)',
                      outlineColor: 'var(--primary-color)',
                    }}
                  >
                    <option value={60}>60</option>
                    <option value={120}>120</option>
                    <option value={300}>300</option>
                    <option value={600}>600</option>
                  </select>
                </div>
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
              </div>
            </div>
            <div className={gridClass}>
              {currentItems.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onImageClick={onImageClick}
                  handleSimilarSearch={handleSimilarSearch}
                  mobileGridCols={mobileGridCols}
                  index={index}
                  shouldAnimate={animatedItems.has(index)}
                  shouldShowInstantly={instantItems.has(index)}
                  isScrolling={isScrolling}
                  isHighlighted={highlightedProductId === product.id}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-8">
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
              </div>
            )}
          </div>
        );
      })()}

      {products.length === 0 && !searchLoading && !scrapeProgress && (
        <div className="py-12 text-center">
          <p className="text-lg" style={{ color: 'var(--text-color)' }}>
            Search for products by tags or view all available products.
          </p>
        </div>
      )}

      {searchLoading && !scrapeProgress && (
        <div className="py-12 text-center">
          <div className="inline-block">
            <div className="w-12 h-12 border-b-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary-color)' }}></div>
            <p className="mt-4" style={{ color: 'var(--text-color)' }}>Loading products...</p>
          </div>
        </div>
      )}
      </div>
    </>
  );
};
export default MainContent;
