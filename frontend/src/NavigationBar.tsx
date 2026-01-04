import React, { useState, useEffect } from 'react';
import { Home, Zap, Settings as SettingsIcon, LogIn, LogOut, User as UserIcon, Bookmark } from 'lucide-react';

interface NavigationBarProps {
  currentTab: 'home' | 'scraper' | 'lists';
  setCurrentTab: (tab: 'home' | 'scraper' | 'lists') => void;
  onSettingsClick: () => void;
  isAuthenticated: boolean;
  username?: string;
  isAdmin?: boolean;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  onSettingsClick,
  isAuthenticated,
  username,
  isAdmin = false,
  onLoginClick,
  onLogoutClick
}) => {
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

  const getTabClass = (tab: 'home' | 'scraper' | 'lists') => {
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
            <span className="hidden sm:inline">Home</span>
          </button>
          {isAuthenticated && (
            <button
              onClick={() => setCurrentTab('lists')}
              className={`${getTabClass('lists')}`}
              style={{
                backgroundColor: currentTab === 'lists' ? 'var(--primary-color)' : 'var(--glass-bg)',
                color: currentTab === 'lists' ? 'var(--button-text)' : 'var(--text-color)',
                borderColor: 'var(--glass-border)',
                transition: 'all 300ms ease-in-out',
              }}
            >
              <Bookmark size={20} />
              <span className="hidden sm:inline">My Lists</span>
            </button>
          )}
          {isAdmin && (
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
              <span className="hidden sm:inline">Scraper</span>
            </button>
          )}
          <button
            onClick={onSettingsClick}
            className="flex items-center justify-center text-sm font-semibold glass-button"
            style={{
              backgroundColor: 'var(--accent-color)',
              color: 'var(--button-text)',
              borderColor: 'var(--glass-border)',
              transition: 'all 300ms ease-in-out',
              aspectRatio: '1 / 1',
              padding: '0.5rem',
            }}
          >
            <SettingsIcon size={20} />
          </button>
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm font-medium sm:block" style={{ color: 'var(--text-color)' }}>{username}</span>
              <button
                onClick={onLogoutClick}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold glass-button"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  color: 'var(--text-color)',
                  borderColor: 'var(--glass-border)',
                  transition: 'all 300ms ease-in-out',
                }}
              >
                <LogOut size={20} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold glass-button"
              style={{
                backgroundColor: 'var(--primary-color)',
                color: 'var(--button-text)',
                borderColor: 'var(--glass-border)',
                transition: 'all 300ms ease-in-out',
              }}
            >
              <UserIcon size={20} />
              <span className="hidden sm:inline">Login</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;