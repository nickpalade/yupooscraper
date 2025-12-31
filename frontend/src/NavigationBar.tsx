import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NavigationBar: React.FC = () => {
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // themeMeta is no longer used here as dynamic theme-color is removed
      // Always update isScrolled
      if (window.scrollY > 1) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    // Call handleScroll once on mount to set initial state
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []); // Empty dependency array means this useEffect runs once on mount and cleanup on unmount

  const getLinkClass = (path: string) => {
    return `px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
      location.pathname === path
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-white'
    }`;
  };

  // This wrapper will handle the initial margin and animation to full width
  const wrapperClasses = `
    fixed inset-x-0 z-50 transition-all duration-300 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.2)]
    ${isScrolled
      ? 'top-0 rounded-none py-2' // Fixed at top, no rounded corners, smaller padding
      : 'top-2 mx-4 rounded-lg py-4' // Fixed, but slightly down from top, with horizontal margins, rounded corners, larger padding
    }
  `;

  return (
    <div className={wrapperClasses.trim()}>
      <div className="container flex flex-col items-center justify-between mx-auto sm:flex-row">
        <div className="flex items-center mb-4 text-center sm:text-left sm:mb-0">
          <img src="/icon.png" alt="Yupoo Scraper Logo" className="w-8 h-8 mr-2" />
          <h1 className="text-2xl font-bold text-black">Yupoo Scraper</h1>
        </div>

        <div className="flex gap-4">
          <Link to="/" className={getLinkClass('/')}>
            Home
          </Link>
          <Link to="/settings" className={getLinkClass('/settings')}>
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;