import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSettings } from './SettingsContext';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false
}) => {
  const { darkMode } = useSettings();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen && !isVisible) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center" 
      style={{
        backgroundColor: isOpen 
          ? (darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)')
          : 'rgba(0, 0, 0, 0)',
        backdropFilter: 'blur(8px)',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 300ms ease-in-out, background-color 300ms ease-in-out',
      }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md p-6 rounded-2xl" 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(25px)',
          animation: isOpen ? 'modalSlideIn 0.3s ease-out' : 'none',
          transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
          opacity: isOpen ? 1 : 0,
          transition: 'all 300ms ease-in-out',
        }}
      >
        <div className="flex items-start gap-4 mb-6">
          {isDanger && (
            <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-full" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
              <AlertTriangle size={24} style={{ color: 'var(--accent-color)' }} />
            </div>
          )}
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-bold" style={{ color: 'var(--text-color)' }}>{title}</h2>
            <p className="text-sm opacity-80" style={{ color: 'var(--text-color)' }}>{message}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-lg font-semibold transition-all duration-300 hover:scale-[1.02]"
            style={{
              backgroundColor: 'var(--glass-bg)',
              color: 'var(--text-color)',
              border: '1px solid var(--glass-border)',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 text-sm rounded-lg font-semibold transition-all duration-300 hover:scale-[1.02]"
            style={{
              backgroundColor: isDanger ? 'var(--accent-color)' : 'var(--button-bg)',
              color: 'var(--button-text)',
              border: '1px solid var(--glass-border)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
