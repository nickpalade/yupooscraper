import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Share2, Loader } from 'lucide-react';
import axios from 'axios';
import { buildApiUrl } from './api-config';
import { Product } from './types';
import SaveButton from './SaveButton';

interface ImagePreviewProps {
  image: string;
  title: string | null;
  onClose: () => void;
  products?: Product[];
  currentProductId?: number;
  onNavigate?: (productId: number) => void;
  onCloseWithHighlight?: (productId: number) => void;
  onSimilarSearch?: (product: Product, sameBrand: boolean) => void;
  isAuthenticated?: boolean;
  authToken?: string | null;
  onLoginRequired?: () => void;
  allProducts?: Product[]; // All products for generating shareable link
  itemsPerPage?: number; // For calculating page number
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ 
  image, 
  title, 
  onClose, 
  products, 
  currentProductId, 
  onNavigate, 
  onCloseWithHighlight, 
  onSimilarSearch,
  isAuthenticated = false,
  authToken = null,
  onLoginRequired = () => {},
  allProducts,
  itemsPerPage = 60
}) => {
  const [offsetY, setOffsetY] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [scale, setScale] = useState(0.95);
  const [bgOpacity, setBgOpacity] = useState(0);
  const [imageOpacity, setImageOpacity] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNavigatingRef = useRef(false);
  const isSwipeNavigationRef = useRef(false);
  const [isFetchingLink, setIsFetchingLink] = useState(false);
  const [pendingSimilarSearch, setPendingSimilarSearch] = useState<boolean | null>(null);
  const similarSearchTimeoutRef = useRef<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const mouseTimeoutRef = useRef<number | null>(null);
  const touchTimeoutRef = useRef<number | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

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

  // Detect image changes and show loading spinner
  useEffect(() => {
    setImageLoading(true);
  }, [image]);

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

  // Handle mouse movement - show/hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    
    // Clear existing timeout
    if (mouseTimeoutRef.current) {
      clearTimeout(mouseTimeoutRef.current);
    }
    
    // Hide controls after 3 seconds of no movement (unless hovering button)
    mouseTimeoutRef.current = window.setTimeout(() => {
      if (!isHoveringButton) {
        setShowControls(false);
      }
    }, 3000);
  };

  // Handle touch - show/hide controls on mobile
  const handleTouchStart = () => {
    if (!isMobile()) return;
    setShowControls(true);
    
    // Clear existing timeout
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
    }
    
    // Hide controls after 3 seconds of no touch (unless hovering button)
    touchTimeoutRef.current = window.setTimeout(() => {
      if (!isHoveringButton) {
        setShowControls(false);
      }
    }, 3000);
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (mouseTimeoutRef.current) {
        clearTimeout(mouseTimeoutRef.current);
      }
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  // Handle share button - generate shareable link
  const handleShare = async () => {
    if (!currentProductId) return;
    
    const shareableUrl = `${window.location.origin}/?preview=${currentProductId}`;
    
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // --- Drag/Swipe Handlers ---

  const handleDragStart = (clientX: number, clientY: number) => {
    if (closing || isNavigatingRef.current || imageLoading) return;
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
    if (imageLoading) return;
    if (canGoPrev && products && onNavigate) {
      isNavigatingRef.current = true;
      const isSwipe = isSwipeNavigationRef.current;
      isSwipeNavigationRef.current = false;
      
      if (isSwipe) {
        // Step 1: Slide current image out to the right with transition
        if (containerRef.current) {
          containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
        }
        setOffsetX(window.innerWidth);
        setImageOpacity(0);
        
        setTimeout(() => {
          // Step 2: Remove transition and position image on the left BEFORE changing content
          if (containerRef.current) {
            containerRef.current.style.transition = 'none';
          }
          setOffsetX(-window.innerWidth);
          
          // Step 3: Force reflow to ensure position is applied
          if (containerRef.current) {
            void containerRef.current.offsetHeight;
          }
          
          // Step 4: Change the image content after position is set
          setTimeout(() => {
            onNavigate(products[currentIndex - 1].id);
            
            // Step 5: Re-enable transition and slide in from left
            requestAnimationFrame(() => {
              if (containerRef.current) {
                containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
              }
              requestAnimationFrame(() => {
                setOffsetX(0);
                setImageOpacity(1);
                setBgOpacity(1);
                setTimeout(() => {
                  isNavigatingRef.current = false;
                }, 200);
              });
            });
          }, 10);
        }, 200);
      } else {
        // Instant navigation for button/key
        onNavigate(products[currentIndex - 1].id);
        isNavigatingRef.current = false;
      }
    }
  };

  const handleNavigateNext = () => {
    if (imageLoading) return;
    if (canGoNext && products && onNavigate) {
      isNavigatingRef.current = true;
      const isSwipe = isSwipeNavigationRef.current;
      isSwipeNavigationRef.current = false;
      
      if (isSwipe) {
        // Step 1: Slide current image out to the left with transition
        if (containerRef.current) {
          containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
        }
        setOffsetX(-window.innerWidth);
        setImageOpacity(0);
        
        setTimeout(() => {
          // Step 2: Remove transition and position image on the right BEFORE changing content
          if (containerRef.current) {
            containerRef.current.style.transition = 'none';
          }
          setOffsetX(window.innerWidth);
          
          // Step 3: Force reflow to ensure position is applied
          if (containerRef.current) {
            void containerRef.current.offsetHeight;
          }
          
          // Step 4: Change the image content after position is set
          setTimeout(() => {
            onNavigate(products[currentIndex + 1].id);
            
            // Step 5: Re-enable transition and slide in from right
            requestAnimationFrame(() => {
              if (containerRef.current) {
                containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
              }
              requestAnimationFrame(() => {
                setOffsetX(0);
                setImageOpacity(1);
                setBgOpacity(1);
                setTimeout(() => {
                  isNavigatingRef.current = false;
                }, 200);
              });
            });
          }, 10);
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
      if (imageLoading) return;
      if (e.key === 'ArrowLeft' && canGoPrev) {
        handleNavigatePrev();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        handleNavigateNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canGoPrev, canGoNext, currentIndex, imageLoading]);

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
      // Clear timeout first
      if (similarSearchTimeoutRef.current) {
        clearTimeout(similarSearchTimeoutRef.current);
      }
      setPendingSimilarSearch(null);
      
      // Call similar search FIRST - this navigates to /similar/:id
      onSimilarSearch(currentProduct, sameBrand);
      
      // Then close preview directly (onClose will update URL state but 
      // it's protected to not do anything on /similar/ routes)
      onClose();
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
      const response = await axios.get<{ external_link: string }>(buildApiUrl(`/api/external-link?url=${encodeURIComponent(currentProduct.album_url)}`));
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
        touchAction: 'none',
        overscrollBehavior: 'contain',
      }}
      onClick={handleClose}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={(e) => {
        // Prevent default scrolling on the background
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
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
        <div className="relative flex-shrink-0 inline-block">
          <button
            onClick={handleClose}
            className={`absolute z-10 flex items-center justify-center transition-all border rounded-xl backdrop-blur-md top-4 right-4 ${isMobile() ? 'w-10 h-10 text-xl' : 'w-14 h-14 text-3xl'}`}
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 20,
              backgroundColor: 'rgba(255, 80, 80, 0.5)',
              borderColor: 'rgba(255, 100, 100, 0.5)',
              color: '#ffffff',
              boxShadow: `0 4px 16px rgba(255, 80, 80, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
            }}
          >
            ✕
          </button>

          {/* Save Button - top right, left of close button */}
          {currentProductId && (
            <div 
              className="absolute z-10 flex gap-2 top-4 right-20"
              style={{ 
                zIndex: 20,
                opacity: showControls || isHoveringButton ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: showControls || isHoveringButton ? 'auto' : 'none'
              }}
              onMouseEnter={() => setIsHoveringButton(true)}
              onMouseLeave={() => setIsHoveringButton(false)}
            >
              <SaveButton
                key={currentProductId}
                productId={currentProductId}
                isAuthenticated={isAuthenticated}
                authToken={authToken}
                onLoginRequired={onLoginRequired}
                compact={isMobile()}
              />
            </div>
          )}
          
          {/* Share Button - bottom right */}
          {currentProductId && (
            <div className="absolute z-10 bottom-4 right-4"
              style={{ 
                zIndex: 20,
                opacity: showControls || isHoveringButton ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: showControls || isHoveringButton ? 'auto' : 'none'
              }}
              onMouseEnter={() => setIsHoveringButton(true)}
              onMouseLeave={() => setIsHoveringButton(false)}
            >
              <button
                onClick={handleShare}
                className={`flex items-center justify-center transition-all border rounded-xl backdrop-blur-md ${isMobile() ? 'w-10 h-10' : 'w-14 h-14'}`}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  borderColor: 'var(--glass-border)',
                  color: 'var(--text-color)',
                  boxShadow: `0 4px 16px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                }}
                title="Copy shareable link"
              >
                <Share2 size={isMobile() ? 18 : 22} />
              </button>
              {showCopiedMessage && (
                <div className="absolute px-3 py-1 text-sm text-white bg-black bg-opacity-75 rounded-lg whitespace-nowrap top-full mt-2 left-1/2 -translate-x-1/2">
                  Link copied!
                </div>
              )}
            </div>
          )}
          
          {/* Left Navigation Arrow */}
          {canGoPrev && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigatePrev();
              }}
              disabled={imageLoading}
              className={`absolute z-10 flex items-center justify-center transition-all transform -translate-y-1/2 border rounded-xl backdrop-blur-md left-4 top-1/2 ${isMobile() ? 'w-10 h-10' : 'w-14 h-14'}`}
              style={{ 
                pointerEvents: 'auto', 
                zIndex: 20,
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
                borderColor: 'var(--glass-border)',
                color: 'var(--text-color)',
                boxShadow: `0 4px 16px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                opacity: imageLoading ? 0.3 : (showControls || isHoveringButton ? 1 : 0),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: imageLoading ? 'none' : (showControls || isHoveringButton ? 'auto' : 'none'),
                cursor: imageLoading ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={() => setIsHoveringButton(true)}
              onMouseLeave={() => setIsHoveringButton(false)}
            >
              <ChevronLeft size={isMobile() ? 22 : 36} />
            </button>
          )}
          
          {/* Right Navigation Arrow */}
          {canGoNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigateNext();
              }}
              disabled={imageLoading}
              className={`absolute z-10 flex items-center justify-center transition-all transform -translate-y-1/2 border rounded-xl backdrop-blur-md right-4 top-1/2 ${isMobile() ? 'w-10 h-10' : 'w-14 h-14'}`}
              style={{ 
                pointerEvents: 'auto', 
                zIndex: 20,
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
                borderColor: 'var(--glass-border)',
                color: 'var(--text-color)',
                boxShadow: `0 4px 16px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                opacity: imageLoading ? 0.3 : (showControls || isHoveringButton ? 1 : 0),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: imageLoading ? 'none' : (showControls || isHoveringButton ? 'auto' : 'none'),
                cursor: imageLoading ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={() => setIsHoveringButton(true)}
              onMouseLeave={() => setIsHoveringButton(false)}
            >
              <ChevronRight size={isMobile() ? 22 : 36} />
            </button>
          )}
          <div className="flex items-center justify-center flex-shrink-0 overflow-hidden rounded-lg shadow-2xl" style={{ 
            width: 'min(70vh, 90vw)',
            height: 'min(70vh, 90vw)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
          }}>
            {imageLoading && (
              <div className="absolute z-20 flex items-center justify-center">
                <Loader size={48} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
              </div>
            )}
            <img
              src={image}
              alt={title || "Preview"}
              className="object-contain w-full h-full"
              style={{ opacity: imageLoading ? 0 : 1, transition: 'opacity 0.2s ease-in-out' }}
              onLoad={() => setImageLoading(false)}
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/800?text=Image+Not+Found';
                setImageLoading(false);
              }}
            />
          </div>
        </div>

        {title && (
          <div className="w-full px-2 mt-4 overflow-hidden text-center" style={{ height: '2.5rem' }}>
            <p className="text-sm font-semibold text-white break-words line-clamp-2">
              {title}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {currentProduct && (
          <div className="grid w-full grid-cols-2 gap-2 px-4 mt-4" style={{ pointerEvents: 'auto', zIndex: 20, position: 'relative' }}>
            <button
              onClick={() => handleSimilarSearchClick(true)}
              className="flex items-center justify-center px-2 py-1 text-xs font-semibold text-center transition-all border rounded backdrop-blur-md whitespace-nowrap"
              style={{
                backgroundColor: pendingSimilarSearch === true ? 'rgba(239, 68, 68, 0.9)' : 'rgba(239, 68, 68, 0.6)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                boxShadow: `0 4px 16px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                transform: pendingSimilarSearch === true ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {pendingSimilarSearch === true ? 'Confirm?' : 'Find Similar (Same Brand)'}
            </button>
            <button
              onClick={() => handleSimilarSearchClick(false)}
              className="flex items-center justify-center px-2 py-1 text-xs font-semibold text-center transition-all border rounded backdrop-blur-md whitespace-nowrap"
              style={{
                backgroundColor: pendingSimilarSearch === false ? 'rgba(239, 68, 68, 0.9)' : 'rgba(239, 68, 68, 0.6)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                boxShadow: `0 4px 16px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                transform: pendingSimilarSearch === false ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {pendingSimilarSearch === false ? 'Confirm?' : 'Find Similar (Any Brand)'}
            </button>
            <a
              href={currentProduct.album_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-xs font-semibold text-center border rounded backdrop-blur-md"
              style={{
                backgroundColor: 'rgba(79, 70, 229, 0.6)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                boxShadow: `0 4px 16px rgba(79, 70, 229, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
              }}
            >
              Yupoo
            </a>
            <button
              onClick={handleAllChinaBuyClick}
              disabled={isFetchingLink}
              className="px-3 py-1 text-xs font-semibold text-center border rounded backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(0, 190, 190, 0.6)',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                boxShadow: `0 4px 16px rgba(0, 190, 190, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
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