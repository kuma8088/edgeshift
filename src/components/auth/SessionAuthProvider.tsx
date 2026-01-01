import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { getCurrentUser, logout as logoutApi, type User } from '../../utils/auth-api';

interface SessionAuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionAuthContext = createContext<SessionAuthContextType | null>(null);

export function useSessionAuth() {
  const context = useContext(SessionAuthContext);
  if (!context) {
    throw new Error('useSessionAuth must be used within SessionAuthProvider');
  }
  return context;
}

interface SessionAuthProviderProps {
  children: ReactNode;
  redirectTo?: string;
  requiredRole?: ('owner' | 'admin' | 'subscriber')[];
}

export function SessionAuthProvider({
  children,
  redirectTo = '/auth/login',
  requiredRole,
}: SessionAuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fetchUser = async () => {
    setIsLoading(true);
    const result = await getCurrentUser();

    if (result.success && result.data) {
      // Check role if required
      if (requiredRole && !requiredRole.includes(result.data.role)) {
        // User doesn't have required role, redirect to login
        setUser(null);
        setIsLoading(false);
        window.location.href = redirectTo;
        return;
      }
      setUser(result.data);
    } else {
      setUser(null);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchUser();
  }, []);

  // Redirect to login if not authenticated (after loading completes)
  // Skip redirect if user is logging out (logout handles its own redirect)
  useEffect(() => {
    if (!isLoading && !user && !isLoggingOut) {
      window.location.href = redirectTo;
    }
  }, [isLoading, user, isLoggingOut, redirectTo]);

  const logout = async () => {
    setIsLoggingOut(true);  // Prevent auto-redirect to ?error=unauthorized
    await logoutApi();
    setUser(null);
    window.location.href = '/auth/login';
  };

  const refresh = async () => {
    await fetchUser();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-[var(--color-text-secondary)]">読み込み中...</div>
      </div>
    );
  }

  // If not authenticated, show redirect message (useEffect handles actual redirect)
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-[var(--color-text-secondary)]">リダイレクト中...</div>
      </div>
    );
  }

  return (
    <SessionAuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
        refresh,
      }}
    >
      {children}
    </SessionAuthContext.Provider>
  );
}
