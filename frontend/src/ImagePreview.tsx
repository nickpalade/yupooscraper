import React, { useState, useEffect, useRef } from 'react';

interface ImagePreviewProps {
  image: string;
  title: string | null;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ image, title, onClose }) => {
  const [offsetY, setOffsetY] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.8); // Initial opacity for the background
  const [isDragging, setIsDragging] = useState(false);
  const [isFlinging, setIsFlinging] = useState(false);
  const dragStartRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // --- Drag Handlers ---
  const handleDragStart = (clientY: number) => {
    // Remove transitions so the drag is instant
    if (containerRef.current) containerRef.current.style.transition = 'none';
    if (backdropRef.current) backdropRef.current.style.transition = 'none';
    
    setIsDragging(true);
    dragStartRef.current = clientY;
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    const deltaY = clientY - dragStartRef.current;
    setOffsetY(deltaY);

    // Fade out the background as the user drags
    const newOpacity = Math.max(0, 0.8 - (Math.abs(deltaY) / 500)); // 500 is drag distance for full fade
    setBgOpacity(newOpacity);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Re-apply transitions for the snap-back or fling animation
    const transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    if (containerRef.current) containerRef.current.style.transition = transition;
    if (backdropRef.current) backdropRef.current.style.transition = 'opacity 0.3s ease-out';
    
    const swipeThreshold = 100; // Min distance in px to trigger a close
    if (Math.abs(offsetY) > swipeThreshold) {
      // Fling and close
      setIsFlinging(true);
      // Move image further down (or up) off the screen
      setOffsetY(offsetY + Math.sign(offsetY) * window.innerHeight);
      setBgOpacity(0);
      
      // Call onClose after the fling animation finishes
      setTimeout(onClose, 300);
    } else {
      // Snap back to center
      setOffsetY(0);
      setBgOpacity(0.8);
    }
  };

  // --- Pointer Event Listeners ---
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if(isDragging) handleDragMove(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    handleDragEnd();
  };

  // Handle ESC key to close preview modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // When closing (e.g. by clicking X or backdrop), animate out
  const handleClose = () => {
    if (containerRef.current) {
        containerRef.current.style.opacity = '0';
        containerRef.current.style.transform = 'scale(0.8)';
    }
    if (backdropRef.current) {
        backdropRef.current.style.opacity = '0';
    }
    setTimeout(onClose, 300);
  }

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black animate-fadeIn ${isFlinging ? 'pointer-events-none' : ''}`}
      style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})` }}
      onClick={isFlinging ? undefined : handleClose}
    >
      {/* Modal Content - Draggable Container */}
      <div
        ref={containerRef}
        className="relative flex flex-col items-center justify-center animate-zoomIn"
        onClick={(e) => e.stopPropagation()} // Prevents clicks inside from closing modal
        style={{
          transform: `translateY(${offsetY}px)`,
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp} // Use onPointerUp for cancel as well
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute z-10 flex items-center justify-center w-12 h-12 text-3xl text-white transition-colors bg-black bg-opacity-50 rounded-full top-4 right-4 hover:text-gray-300"
        >
          ✕
        </button>

        {/* Image */}
        <img
          src={image}
          alt={title || "Preview"}
          className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          onError={(e) => {
            e.currentTarget.src = 'https://via.placeholder.com/800?text=Image+Not+Found';
          }}
        />

        {/* Title */}
        {title && (
          <div className="mt-6 text-center">
            <p className="max-w-2xl text-xl font-semibold text-white">
              {title}
            </p>
          </div>
        )}

        {/* Press ESC hint */}
        <div className="absolute text-sm text-gray-400 transform -translate-x-1/2 bottom-4 left-1/2">
          Press ESC to close
        </div>
      </div>

      {/* CSS for initial open animations */}
      <style>{`
        @keyframes fadeIn {
          from { background-color: rgba(0, 0, 0, 0); }
          to { background-color: rgba(0, 0, 0, 0.8); }
        }
        @keyframes zoomIn {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-in-out; }
        .animate-zoomIn { animation: zoomIn 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default ImagePreview;