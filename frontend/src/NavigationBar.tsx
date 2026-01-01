import React, { useState, useEffect } from 'react';
import { Home, Zap, Settings as SettingsIcon } from 'lucide-react';

interface NavigationBarProps {
  currentTab: 'home' | 'scraper';
  setCurrentTab: (tab: 'home' | 'scraper') => void;
  onSettingsClick: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ currentTab, setCurrentTab, onSettingsClick }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 1) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getTabClass = (tab: 'home' | 'scraper') => {
    return `glass-button px-4 py-2 rounded-lg font-semibold transition-colors duration-300 text-sm flex items-center gap-2 ${
      currentTab === tab
        ? 'shadow-lg' // Apply shadow directly if active
        : ''
    }`;
  };

  const wrapperClasses = `
    fixed inset-x-0 z-50 glass-container
    ${isScrolled ? 'rounded-none' : 'rounded-xl'}
  `;

  const wrapperStyles: React.CSSProperties = {
    top: isScrolled ? 0 : 8,
    marginLeft: isScrolled ? 0 : 16,
    marginRight: isScrolled ? 0 : 16,
    paddingTop: isScrolled ? 8 : 16,
    paddingBottom: isScrolled ? 8 : 16,
    transition: 'all 300ms ease-in-out',
  };

  return (
    <div className={wrapperClasses.trim()} style={wrapperStyles}>
      <div className="container flex flex-col items-center justify-between mx-auto sm:flex-row">
        <div className="flex items-center mb-4 text-center sm:text-left sm:mb-0">
          <img src="/icon.png" alt="Yupoo Scraper Logo" className="w-8 h-8 mr-2" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-color)' }}>Yupoo Scraper</h1>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setCurrentTab('home')}
            className={`${getTabClass('home')}`}
            style={{
              backgroundColor: currentTab === 'home' ? 'var(--primary-color)' : 'var(--glass-bg)',
              color: currentTab === 'home' ? 'var(--button-text)' : 'var(--text-color)',
              borderColor: 'var(--glass-border)',
              transition: 'all 300ms ease-in-out',
            }}
          >
            <Home size={20} />
            Home
          </button>
          <button
            onClick={() => setCurrentTab('scraper')}
            className={`${getTabClass('scraper')}`}
            style={{
              backgroundColor: currentTab === 'scraper' ? 'var(--primary-color)' : 'var(--glass-bg)',
              color: currentTab === 'scraper' ? 'var(--button-text)' : 'var(--text-color)',
              borderColor: 'var(--glass-border)',
              transition: 'all 300ms ease-in-out',
            }}
          >
            <Zap size={20} />
            Scraper
          </button>
          <button
            onClick={onSettingsClick}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold glass-button"
            style={{
              backgroundColor: 'var(--accent-color)',
              color: 'var(--button-text)',
              borderColor: 'var(--glass-border)',
              transition: 'all 300ms ease-in-out',
            }}
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;