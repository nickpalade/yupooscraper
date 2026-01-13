import React, { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Loader } from 'lucide-react';
import { Product } from './types';
import { buildApiUrl } from './api-config';
import ProductGrid from './ProductGrid';
import Pagination from './Pagination';

interface SimilarSearchPageProps {
  setProducts: (products: Product[]) => void;
  setSearchLoading: (loading: boolean) => void;
  setSearchError: (error: string | null) => void;
  setIsInSimilarSearchMode: (mode: boolean) => void;
  searchLoading: boolean;
  searchError: string | null;
  products: Product[];
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  setItemsPerPage: (items: number) => void;
  mobileGridCols: number;
  setMobileGridCols: (cols: number) => void;
  onImageClick: (image: string, title: string, productId?: number) => void;
  onBackToPreviousResults: () => void;
  highlightedProductId?: number | null;
  isAuthenticated?: boolean;
  authToken?: string | null;
  onLoginRequired?: () => void;
}

const SimilarSearchPage: React.FC<SimilarSearchPageProps> = ({
  setProducts,
  setSearchLoading,
  setSearchError,
  setIsInSimilarSearchMode,
  searchLoading,
  searchError,
  products,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  mobileGridCols,
  setMobileGridCols,
  onImageClick,
  onBackToPreviousResults,
  highlightedProductId,
  isAuthenticated = false,
  authToken = null,
  onLoginRequired = () => {}
}) => {
  const { productId } = useParams<{ productId: string }>();
  const [searchParams] = useSearchParams();
  const sameBrand = searchParams.get('sameBrand') === 'true';
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSimilarProducts = async () => {
      if (!productId) return;

      setIsInSimilarSearchMode(true);
      setSearchError(null);
      setSearchLoading(true);
      setProducts([]);
      setCurrentPage(1);

      try {
        const params: any = { limit: 100 };
        if (sameBrand) {
          params.same_brand = true;
        }
        const response = await axios.get<Product[]>(
          buildApiUrl(`/api/products/similar-by-color/${productId}`),
          { params }
        );

        setProducts(response.data);

        if (response.data.length === 0) {
          setSearchError('No similar products found');
        }

        // Scroll to top
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      } catch (err: any) {
        setSearchError(err?.response?.data?.detail || 'An error occurred while finding similar products');
      } finally {
        setSearchLoading(false);
      }
    };

    fetchSimilarProducts();
  }, [productId, sameBrand]);

  const handlePageChange = (page: number) => {
    if (resultsRef.current) {
      const { top } = resultsRef.current.getBoundingClientRect();
      const navbarHeight = 112;
      const scrollThreshold = 200;

      // Check if we need to scroll
      const needsScrolling = top < 0 || top > window.innerHeight - scrollThreshold;

      if (needsScrolling) {
        const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - navbarHeight;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
    
    setCurrentPage(page);
  };

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
    <div className="container px-4 py-8 pt-40 mx-auto md:pt-28">
      {searchLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin" style={{ color: 'var(--primary-color)' }} />
        </div>
      )}

      {searchError && (
        <div className="p-4 mb-6 text-center rounded-lg" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}>
          {searchError}
        </div>
      )}

      {!searchLoading && !searchError && products.length === 0 && (
        <div className="p-4 mb-6 text-center rounded-lg" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}>
          No similar products found
        </div>
      )}

      {products.length > 0 && (
        <div className="mb-8" ref={resultsRef} id="search-results">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-color)' }}>
              Similar Products ({products.length})
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
                </select>
              </div>
              <button
                onClick={onBackToPreviousResults}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 glass-button hover:shadow-lg"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                  color: 'white',
                  border: 'none'
                }}
              >
                ← Back to Previous Results
              </button>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
            </div>
          </div>
          <ProductGrid
            products={currentItems}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            mobileGridCols={mobileGridCols}
            onImageClick={onImageClick}
            handleSimilarSearch={() => {}}
            highlightedProductId={highlightedProductId}
            isAuthenticated={isAuthenticated}
            authToken={authToken}
            onLoginRequired={onLoginRequired}
          />
        </div>
      )}
    </div>
  );
};

export default SimilarSearchPage;
