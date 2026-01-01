import React, { useRef } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  const prevButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const lastEventTime = useRef(0);

  if (totalPages <= 1) {
    return null;
  }

  const handleAction = (action: () => void, ref: React.RefObject<HTMLButtonElement>) => {
    const now = Date.now();
    // Debounce to prevent touch and emulated click from firing together
    if (now - lastEventTime.current < 150) {
      return;
    }
    lastEventTime.current = now;
    action();
    ref.current?.blur();
  };

  const handlePrevious = () => {
    handleAction(() => onPageChange(Math.max(1, currentPage - 1)), prevButtonRef);
  };

  const handleNext = () => {
    handleAction(() => onPageChange(Math.min(totalPages, currentPage + 1)), nextButtonRef);
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        ref={prevButtonRef}
        onClick={handlePrevious}
        onTouchStart={handlePrevious}
        disabled={currentPage === 1}
        className="px-4 py-2 font-semibold shadow-sm glass-button disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-text)',
          borderColor: 'var(--glass-border)',
        }}
      >
        Previous
      </button>
      <span className="font-medium" style={{ color: 'var(--text-color)' }}>
        Page {currentPage} of {totalPages}
      </span>
      <button
        ref={nextButtonRef}
        onClick={handleNext}
        onTouchStart={handleNext}
        disabled={currentPage === totalPages}
        className="px-4 py-2 font-semibold shadow-sm glass-button disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-text)',
          borderColor: 'var(--glass-border)',
        }}
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
