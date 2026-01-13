import React, { useRef, useState, useEffect } from 'react';
import { Product } from './types';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  currentPage: number;
  itemsPerPage: number;
  mobileGridCols: number;
  onImageClick: (image: string, title: string, productId?: number) => void;
  handleSimilarSearch: (product: Product, sameBrand: boolean) => void;
  highlightedProductId?: number | null;
  isAuthenticated?: boolean;
  authToken?: string | null;
  onLoginRequired?: () => void;
  showSaveButton?: boolean;
}

const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  currentPage,
  itemsPerPage,
  mobileGridCols,
  onImageClick,
  handleSimilarSearch,
  highlightedProductId,
  isAuthenticated = false,
  authToken = null,
  onLoginRequired = () => {},
  showSaveButton = true
}) => {
  const [isScrolling, setIsScrolling] = useState(false);
  const [animatedItems, setAnimatedItems] = useState<Set<number>>(new Set());
  const [instantItems, setInstantItems] = useState<Set<number>>(new Set());
  const [imagesLoaded, setImagesLoaded] = useState<Set<number>>(new Set());
  const [waitingForImages, setWaitingForImages] = useState<Set<number>>(new Set());

  // Reset animation state when page changes
  useEffect(() => {
    setAnimatedItems(new Set());
    setInstantItems(new Set());
    setImagesLoaded(new Set());
    setWaitingForImages(new Set());
  }, [currentPage]);

  // Calculate which items are visible and should be animated
  useEffect(() => {
    if (products.length === 0) return;

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = products.slice(indexOfFirstItem, indexOfLastItem);

    // Identify items that should be in the initial viewport
    const viewportHeight = window.innerHeight;
    const initialViewportIndices = new Set<number>();
    
    // Estimate how many items fit in viewport (rough calculation)
    const estimatedItemsInViewport = Math.ceil(viewportHeight / 300) * 3; // Assuming ~300px height per row
    for (let i = 0; i < Math.min(estimatedItemsInViewport, currentItems.length); i++) {
      initialViewportIndices.add(i);
    }
    
    // Mark these items as waiting for images
    setWaitingForImages(initialViewportIndices);

    const observer = new IntersectionObserver(
      (entries) => {
        const bufferSpace = viewportHeight * 2; // Two full screens as buffer

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0', 10);
            const rect = entry.target.getBoundingClientRect();
            
            // Check if item is within viewport + buffer
            if (rect.top < viewportHeight + bufferSpace) {
              // If this item is NOT in the initial waiting set, show it instantly (no animation)
              if (!initialViewportIndices.has(index)) {
                setInstantItems((prev) => {
                  const newSet = new Set(prev);
                  newSet.add(index);
                  return newSet;
                });
              }
              
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

  // Trigger animation once all initial images are loaded
  useEffect(() => {
    if (waitingForImages.size === 0) return;
    
    // Check if all waiting images have loaded
    const allLoaded = Array.from(waitingForImages).every(index => imagesLoaded.has(index));
    
    if (allLoaded) {
      // All images loaded, trigger animations
      setAnimatedItems(new Set(waitingForImages));
      setWaitingForImages(new Set()); // Clear waiting state
    }
  }, [imagesLoaded, waitingForImages]);

  // Handle image load callback
  const handleImageLoaded = React.useCallback((index: number) => {
    setImagesLoaded((prev) => {
      const newSet = new Set(prev);
      newSet.add(index);
      return newSet;
    });
  }, []);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = products.slice(indexOfFirstItem, indexOfLastItem);

  let gridClass: string;
  switch(mobileGridCols) {
    case 3: gridClass = 'grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6'; break;
    case 2: gridClass = 'grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4'; break;
    case 1: default: gridClass = 'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  }

  return (
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
          isAuthenticated={isAuthenticated}
          authToken={authToken}
          onLoginRequired={onLoginRequired}
          showSaveButton={showSaveButton}
          onImageLoaded={handleImageLoaded}
        />
      ))}
    </div>
  );
};

export default ProductGrid;
