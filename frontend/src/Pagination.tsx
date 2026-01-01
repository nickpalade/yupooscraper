import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button 
        onClick={() => onPageChange(Math.max(1, currentPage - 1))} 
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
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
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
