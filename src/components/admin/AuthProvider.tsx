import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { isAuthenticated, clearApiKey, apiRequest } from '../../utils/admin-api';

interface AuthContextType {
  authenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const verifyAuth = () => {
    setLoading(true);
    setError(null);

    // Check if already authenticated
    if (isAuthenticated()) {
      // Verify the API key is still valid
      apiRequest('/dashboard/stats').then(result => {
        if (result.success) {
          setAuthenticated(true);
          setLoading(false);
        } else if (result.error?.includes('Authentication failed') || result.error === 'Not authenticated') {
          // 401 error or invalid/empty key - clear and redirect to login
          clearApiKey();
          setLoading(false);
          window.location.href = '/auth/login?error=unauthorized';
        } else {
          // Transient error (network, server error) - show retry state
          setError(result.error || 'サーバーに接続できませんでした');
          setLoading(false);
        }
      });
    } else {
      // Not authenticated, redirect to Magic Link login
      setLoading(false);
      window.location.href = '/auth/login?error=unauthorized';
    }
  };

  useEffect(() => {
    verifyAuth();
  }, []);

  const logout = () => {
    clearApiKey();
    setAuthenticated(false);
    window.location.href = '/auth/login';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[var(--color-text-secondary)]">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={verifyAuth}
            className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[var(--color-text-secondary)]">リダイレクト中...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ authenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
