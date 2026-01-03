import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { Product } from './types';

interface ImagePreviewProps {
  image: string;
  title: string | null;
  onClose: () => void;
  products?: Product[];
  currentProductId?: number;
  onNavigate?: (productId: number) => void;
  onCloseWithHighlight?: (productId: number) => void;
  onSimilarSearch?: (product: Product, sameBrand: boolean) => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ image, title, onClose, products, currentProductId, onNavigate, onCloseWithHighlight, onSimilarSearch }) => {
  const [offsetY, setOffsetY] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [scale, setScale] = useState(0.95);
  const [bgOpacity, setBgOpacity] = useState(0);
  const [imageOpacity, setImageOpacity] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNavigatingRef = useRef(false);
  const isSwipeNavigationRef = useRef(false);
  const [isFetchingLink, setIsFetchingLink] = useState(false);
  const [pendingSimilarSearch, setPendingSimilarSearch] = useState<boolean | null>(null);
  const similarSearchTimeoutRef = useRef<number | null>(null);

  // Find current product index
  const currentIndex = products?.findIndex(p => p.id === currentProductId) ?? -1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < (products?.length ?? 0) - 1;
  const currentProduct = currentIndex >= 0 && products ? products[currentIndex] : null;

  // --- Animation and Lifecycle ---

  // Initial animation on mount
  useEffect(() => {
    setScale(1);
    setBgOpacity(1);
    setImageOpacity(1);
  }, []);

  // Close with zoom-out animation for click/ESC
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    // Start scroll animation immediately
    if (onCloseWithHighlight && currentProductId !== undefined) {
      onCloseWithHighlight(currentProductId);
    }
    setScale(0.95);
    setBgOpacity(0);
    setImageOpacity(0);
    setTimeout(() => {
      onClose();
    }, 300); // Unmount after animation
  };

  // Listen for ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [closing, onCloseWithHighlight, currentProductId]);

  // --- Drag/Swipe Handlers ---

  const handleDragStart = (clientX: number, clientY: number) => {
    if (closing || isNavigatingRef.current) return;
    if (containerRef.current) containerRef.current.style.transition = 'none';
    setIsDragging(true);
    dragStartRef.current = { x: clientX, y: clientY };
    dragDirection.current = null;
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    // Determine drag direction on first significant movement
    if (!dragDirection.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      dragDirection.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }

    if (dragDirection.current === 'vertical') {
      setOffsetY(deltaY);
      setOffsetX(0);
      // As user drags, fade out the background ONLY
      const newBgOpacity = Math.max(0, 1 - Math.abs(deltaY) / 400);
      setBgOpacity(newBgOpacity);
    } else if (dragDirection.current === 'horizontal') {
      setOffsetX(deltaX);
      setOffsetY(0);
      // Fade slightly for visual feedback
      const newBgOpacity = Math.max(0.7, 1 - Math.abs(deltaX) / 800);
      setBgOpacity(newBgOpacity);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Re-apply transition for snap-back or navigation
    if (containerRef.current) containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
    
    const swipeThreshold = 50;
    
    if (dragDirection.current === 'vertical') {
      if (Math.abs(offsetY) > swipeThreshold && !closing) {
        // Fling close - only if not already closing
        setClosing(true);
        // Start scroll animation immediately
        if (onCloseWithHighlight && currentProductId !== undefined) {
          onCloseWithHighlight(currentProductId);
        }
        setOffsetY(offsetY + Math.sign(offsetY) * window.innerHeight);
        setBgOpacity(0);
        setTimeout(() => {
          onClose();
        }, 300);
      } else {
        // Snap back to center
        setOffsetY(0);
        setBgOpacity(1);
      }
    } else if (dragDirection.current === 'horizontal') {
      if (Math.abs(offsetX) > swipeThreshold) {
        // Navigate to prev/next via swipe
        isSwipeNavigationRef.current = true;
        if (offsetX > 0 && canGoPrev) {
          handleNavigatePrev();
        } else if (offsetX < 0 && canGoNext) {
          handleNavigateNext();
        } else {
          // Can't navigate, snap back
          setOffsetX(0);
          setBgOpacity(1);
        }
      } else {
        // Snap back to center
        setOffsetX(0);
        setBgOpacity(1);
      }
    }
    
    dragDirection.current = null;
  };

  const handleNavigatePrev = () => {
    if (canGoPrev && products && onNavigate) {
      isNavigatingRef.current = true;
      const isSwipe = isSwipeNavigationRef.current;
      isSwipeNavigationRef.current = false;
      
      if (isSwipe) {
        // Slide animation for swipe
        if (containerRef.current) containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
        setOffsetX(window.innerWidth);
        setImageOpacity(0);
        setTimeout(() => {
          // Instantly reset to left side
          if (containerRef.current) containerRef.current.style.transition = 'none';
          setOffsetX(-window.innerWidth);
          onNavigate(products[currentIndex - 1].id);
          // Slide in from left
          setTimeout(() => {
            if (containerRef.current) containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
            setOffsetX(0);
            setImageOpacity(1);
            setBgOpacity(1);
            isNavigatingRef.current = false;
          }, 20);
        }, 200);
      } else {
        // Instant navigation for button/key
        onNavigate(products[currentIndex - 1].id);
        isNavigatingRef.current = false;
      }
    }
  };

  const handleNavigateNext = () => {
    if (canGoNext && products && onNavigate) {
      isNavigatingRef.current = true;
      const isSwipe = isSwipeNavigationRef.current;
      isSwipeNavigationRef.current = false;
      
      if (isSwipe) {
        // Slide animation for swipe
        if (containerRef.current) containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
        setOffsetX(-window.innerWidth);
        setImageOpacity(0);
        setTimeout(() => {
          // Instantly reset to right side
          if (containerRef.current) containerRef.current.style.transition = 'none';
          setOffsetX(window.innerWidth);
          onNavigate(products[currentIndex + 1].id);
          // Slide in from right
          setTimeout(() => {
            if (containerRef.current) containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
            setOffsetX(0);
            setImageOpacity(1);
            setBgOpacity(1);
            isNavigatingRef.current = false;
          }, 20);
        }, 200);
      } else {
        // Instant navigation for button/key
        onNavigate(products[currentIndex + 1].id);
        isNavigatingRef.current = false;
      }
    }
  };

  // --- Pointer Event Listeners ---
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    // Check if the target is a button or link - if so, don't start dragging
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.closest('button') || target.closest('a')) {
      return;
    }
    handleDragStart(e.clientX, e.clientY);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isDragging) handleDragMove(e.clientX, e.clientY);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    handleDragEnd();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canGoPrev) {
        handleNavigatePrev();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        handleNavigateNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canGoPrev, canGoNext, currentIndex]);

  // Cleanup similar search timeout
  useEffect(() => {
    return () => {
      if (similarSearchTimeoutRef.current) {
        clearTimeout(similarSearchTimeoutRef.current);
      }
    };
  }, []);

  // Helper functions
  const isMobile = (): boolean => {
    if (navigator.userAgentData) {
      return navigator.userAgentData.mobile;
    }
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android|ipad|iphone|ipod|windows phone/i.test(userAgent);
  };

  const buildAllChinaBuyUrl = (productUrl: string): string => {
    const base = 'https://www.allchinabuy.com/en/page/buy/';
    const params = new URLSearchParams({
      nTag: 'Home-search',
      from: 'search-input',
      _search: 'url',
      position: '',
      url: productUrl
    });
    return `${base}?${params.toString()}`;
  };

  const handleSimilarSearchClick = (sameBrand: boolean) => {
    if (!currentProduct || !onSimilarSearch) return;
    
    if (pendingSimilarSearch === sameBrand) {
      onSimilarSearch(currentProduct, sameBrand);
      setPendingSimilarSearch(null);
      if (similarSearchTimeoutRef.current) {
        clearTimeout(similarSearchTimeoutRef.current);
      }
      handleClose();
    } else {
      setPendingSimilarSearch(sameBrand);
      if (similarSearchTimeoutRef.current) {
        clearTimeout(similarSearchTimeoutRef.current);
      }
      similarSearchTimeoutRef.current = window.setTimeout(() => {
        setPendingSimilarSearch(null);
      }, 1500);
    }
  };

  const handleAllChinaBuyClick = async () => {
    if (!currentProduct) return;
    setIsFetchingLink(true);
    const mobileDevice = isMobile();

    try {
      const response = await axios.get<{ external_link: string }>(`/api/external-link?url=${encodeURIComponent(currentProduct.album_url)}`);
      const externalLink = response.data.external_link;
      
      if (externalLink) {
        const allChinaBuyLink = buildAllChinaBuyUrl(externalLink);
        if (mobileDevice) {
          window.location.href = allChinaBuyLink;
        } else {
          const link = document.createElement('a');
          link.href = allChinaBuyLink;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } catch (error) {
      console.error('Error fetching external link:', error);
    } finally {
      setIsFetchingLink(false);
    }
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: `rgba(0, 0, 0, ${bgOpacity * 0.5})`,
        backdropFilter: `blur(${bgOpacity * 16}px)`,
        transition: isDragging ? 'none' : 'background-color 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), backdrop-filter 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
      }}
      onClick={handleClose}
    >
      {/* Fixed touch capture overlay - matches image preview size but stays fixed */}
      <div
        className="fixed z-10 flex items-center justify-center"
        style={{
          top: isDragging ? '0' : '50%',
          left: isDragging ? '0' : '50%',
          right: isDragging ? '0' : 'auto',
          bottom: isDragging ? '0' : 'auto',
          transform: isDragging ? 'none' : 'translate(-50%, -50%)',
          maxHeight: isDragging ? 'none' : '92vh',
          width: isDragging ? '100vw' : 'min(70vh, 90vw)',
          height: isDragging ? '100vh' : '100%',
          touchAction: 'none',
          pointerEvents: 'none',
          transition: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      />
      
      {/* Animated content div */}
      <div
        ref={containerRef}
        className="relative flex flex-col items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          opacity: imageOpacity,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
          maxHeight: '92vh',
          width: 'min(70vh, 90vw)',
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          handlePointerDown(e as any);
        }}
        onPointerMove={(e) => {
          e.preventDefault();
          handlePointerMove(e as any);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          handlePointerUp(e as any);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          handlePointerUp(e as any);
        }}
      >
        <div className="relative inline-block flex-shrink-0">
          <button
            onClick={handleClose}
            className="absolute z-10 flex items-center justify-center w-12 h-12 text-3xl text-white transition-colors bg-black bg-opacity-50 rounded-full top-4 right-4 hover:text-gray-300"
            style={{ pointerEvents: 'auto', zIndex: 20 }}
          >
            ✕
          </button>
          
          {/* Left Navigation Arrow */}
          {canGoPrev && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigatePrev();
              }}
              className="absolute z-10 flex items-center justify-center w-12 h-12 text-white transition-all transform -translate-y-1/2 bg-black bg-opacity-50 rounded-full left-4 top-1/2 hover:bg-opacity-70 hover:scale-110"
              style={{ pointerEvents: 'auto', zIndex: 20 }}
            >
              <ChevronLeft size={32} />
            </button>
          )}
          
          {/* Right Navigation Arrow */}
          {canGoNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigateNext();
              }}
              className="absolute z-10 flex items-center justify-center w-12 h-12 text-white transition-all transform -translate-y-1/2 bg-black bg-opacity-50 rounded-full right-4 top-1/2 hover:bg-opacity-70 hover:scale-110"
              style={{ pointerEvents: 'auto', zIndex: 20 }}
            >
              <ChevronRight size={32} />
            </button>
          )}
          <div className="flex items-center justify-center flex-shrink-0 rounded-lg shadow-2xl overflow-hidden" style={{ 
            width: 'min(70vh, 90vw)',
            height: 'min(70vh, 90vw)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
          }}>
            <img
              src={image}
              alt={title || "Preview"}
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/800?text=Image+Not+Found';
              }}
            />
          </div>
        </div>

        {title && (
          <div className="mt-4 text-center px-2 w-full overflow-hidden" style={{ height: '2.5rem' }}>
            <p className="text-sm font-semibold text-white line-clamp-2 break-words">
              {title}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {currentProduct && (
          <div className="grid grid-cols-2 gap-2 mt-4 px-4 w-full" style={{ pointerEvents: 'auto', zIndex: 20, position: 'relative' }}>
            <button
              onClick={() => handleSimilarSearchClick(true)}
              className="px-2 py-1 text-xs font-semibold text-center rounded border transition-all flex items-center justify-center whitespace-nowrap"
              style={{
                backgroundColor: pendingSimilarSearch === true ? 'rgb(239, 68, 68)' : 'rgba(239, 68, 68, 0.8)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                transform: pendingSimilarSearch === true ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {pendingSimilarSearch === true ? 'Confirm?' : 'Find Similar (Same Brand)'}
            </button>
            <button
              onClick={() => handleSimilarSearchClick(false)}
              className="px-2 py-1 text-xs font-semibold text-center rounded border transition-all flex items-center justify-center whitespace-nowrap"
              style={{
                backgroundColor: pendingSimilarSearch === false ? 'rgb(239, 68, 68)' : 'rgba(239, 68, 68, 0.8)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                transform: pendingSimilarSearch === false ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {pendingSimilarSearch === false ? 'Confirm?' : 'Find Similar (Any Brand)'}
            </button>
            <a
              href={currentProduct.album_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-xs font-semibold text-center rounded border"
              style={{
                backgroundColor: 'rgba(79, 70, 229, 0.8)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              Yupoo
            </a>
            <button
              onClick={handleAllChinaBuyClick}
              disabled={isFetchingLink}
              className="px-3 py-1 text-xs font-semibold text-center rounded border disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(0, 190, 190, 0.8)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              {isFetchingLink ? 'Fetching...' : 'AllChinaBuy'}
            </button>
          </div>
        )}

        
      </div>
    </div>
  );
};

export default ImagePreview;