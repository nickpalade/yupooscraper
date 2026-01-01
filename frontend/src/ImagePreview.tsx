import React, { useState, useEffect, useRef } from 'react';

interface ImagePreviewProps {
  image: string;
  title: string | null;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ image, title, onClose }) => {
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(0.95);
  const [bgOpacity, setBgOpacity] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragStartRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Animation and Lifecycle ---

  // Initial animation on mount
  useEffect(() => {
    setScale(1);
    setBgOpacity(1);
  }, []);

  // Close with zoom-out animation for click/ESC
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setScale(0.95);
    setBgOpacity(0);
    setTimeout(onClose, 300); // Unmount after animation
  };

  // Listen for ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // --- Drag/Swipe Handlers ---

  const handleDragStart = (clientY: number) => {
    if (closing) return;
    if (containerRef.current) containerRef.current.style.transition = 'none';
    setIsDragging(true);
    dragStartRef.current = clientY;
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    const deltaY = clientY - dragStartRef.current;
    setOffsetY(deltaY);
    // As user drags, fade out the background
    const newOpacity = Math.max(0, 1 - Math.abs(deltaY) / 400);
    setBgOpacity(newOpacity);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Re-apply transition for snap-back or fling
    if (containerRef.current) containerRef.current.style.transition = 'transform 0.3s ease-out';
    
    const swipeThreshold = 100;
    if (Math.abs(offsetY) > swipeThreshold) {
      // Fling close
      setClosing(true);
      // Animate it off-screen
      setOffsetY(offsetY + Math.sign(offsetY) * window.innerHeight);
      setBgOpacity(0);
      setTimeout(onClose, 300); // Unmount after animation
    } else {
      // Snap back to center
      setOffsetY(0);
      setBgOpacity(1);
    }
  };

  // --- Pointer Event Listeners ---
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isDragging) handleDragMove(e.clientY);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    handleDragEnd();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: `rgba(0, 0, 0, ${bgOpacity * 0.5})`,
        backdropFilter: `blur(${bgOpacity * 16}px)`,
        transition: isDragging ? 'none' : 'background-color 0.3s ease-out, backdrop-filter 0.3s ease-out',
      }}
      onClick={handleClose}
    >
      <div
        ref={containerRef}
        className="relative flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translateY(${offsetY}px) scale(${scale})`,
          touchAction: 'none',
          opacity: bgOpacity, // Link opacity to background for a cohesive feel
          transition: isDragging ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease-out',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="relative inline-block">
          <button
            onClick={handleClose}
            className="absolute z-10 flex items-center justify-center w-12 h-12 text-3xl text-white transition-colors bg-black bg-opacity-50 rounded-full top-4 right-4 hover:text-gray-300"
          >
            ✕
          </button>
          <img
            src={image}
            alt={title || "Preview"}
            className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onError={(e) => {
              e.currentTarget.src = 'https://via.placeholder.com/800?text=Image+Not+Found';
            }}
          />
        </div>

        {title && (
          <div className="mt-6 text-center">
            <p className="max-w-2xl text-xl font-semibold text-white">
              {title}
            </p>
          </div>
        )}

        <div className="absolute text-sm text-gray-400 transform -translate-x-1/2 bottom-4 left-1/2">
          Press ESC to close
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;