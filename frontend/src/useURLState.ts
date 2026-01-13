import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';

/**
 * Custom hook to synchronize application state with URL parameters
 * This enables sharing links that preserve the application state
 */
export const useURLState = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isInitialMount = useRef(true);

  // Get state from URL
  const getURLState = useCallback(() => {
    return {
      page: parseInt(searchParams.get('page') || '1', 10),
      preview: searchParams.get('preview') || null,
      tags: searchParams.get('tags')?.split(',').filter(Boolean) || [],
      showLogin: searchParams.get('login') === 'true',
      showSignup: searchParams.get('signup') === 'true',
      showSettings: searchParams.get('settings') === 'true',
      similarProductId: searchParams.get('similar') || null,
      similarSameBrand: searchParams.get('sameBrand') === 'true',
    };
  }, [searchParams]);

  // Update URL with new state
  const updateURLState = useCallback((updates: {
    page?: number;
    preview?: string | null;
    tags?: string[];
    showLogin?: boolean;
    showSignup?: boolean;
    showSettings?: boolean;
    similarProductId?: string | null;
    similarSameBrand?: boolean | null;
  }) => {
    const newParams = new URLSearchParams(searchParams);

    // Update or remove parameters based on updates
    if (updates.page !== undefined) {
      if (updates.page === 1) {
        newParams.delete('page');
      } else {
        newParams.set('page', updates.page.toString());
      }
    }

    if (updates.preview !== undefined) {
      if (updates.preview === null) {
        newParams.delete('preview');
      } else {
        newParams.set('preview', updates.preview);
      }
    }

    if (updates.tags !== undefined) {
      if (updates.tags.length === 0) {
        newParams.delete('tags');
      } else {
        newParams.set('tags', updates.tags.join(','));
      }
    }

    if (updates.showLogin !== undefined) {
      if (updates.showLogin) {
        newParams.set('login', 'true');
        newParams.delete('signup');
      } else {
        newParams.delete('login');
      }
    }

    if (updates.showSignup !== undefined) {
      if (updates.showSignup) {
        newParams.set('signup', 'true');
        newParams.delete('login');
      } else {
        newParams.delete('signup');
      }
    }

    if (updates.showSettings !== undefined) {
      if (updates.showSettings) {
        newParams.set('settings', 'true');
      } else {
        newParams.delete('settings');
      }
    }

    if (updates.similarProductId !== undefined) {
      if (updates.similarProductId === null) {
        newParams.delete('similar');
        newParams.delete('sameBrand');
      } else {
        newParams.set('similar', updates.similarProductId);
      }
    }

    if (updates.similarSameBrand !== undefined) {
      if (updates.similarSameBrand === null || !updates.similarSameBrand) {
        newParams.delete('sameBrand');
      } else {
        newParams.set('sameBrand', 'true');
      }
    }

    // IMPORTANT: Don't update URL params if we're on a special route like /similar/ or /lists
    // This prevents setSearchParams from navigating away from the current path
    if (location.pathname.startsWith('/similar/') || location.pathname.startsWith('/lists')) {
      return;
    }

    // Update URL without adding to history (replace)
    setSearchParams(newParams, { replace: !isInitialMount.current });
  }, [searchParams, setSearchParams, location.pathname]);

  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  return {
    urlState: getURLState(),
    updateURLState,
  };
};
