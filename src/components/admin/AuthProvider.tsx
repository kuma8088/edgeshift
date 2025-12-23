import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { isAuthenticated, setApiKey, clearApiKey, apiRequest } from '../../utils/admin-api';
import { LoginForm } from './LoginForm';

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

  useEffect(() => {
    // Check if already authenticated
    if (isAuthenticated()) {
      // Verify the API key is still valid
      apiRequest('/dashboard/stats').then(result => {
        setAuthenticated(result.success);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = async (apiKey: string): Promise<boolean> => {
    setApiKey(apiKey);
    const result = await apiRequest('/dashboard/stats');
    if (result.success) {
      setAuthenticated(true);
      return true;
    }
    clearApiKey();
    return false;
  };

  const logout = () => {
    clearApiKey();
    setAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#525252]">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <AuthContext.Provider value={{ authenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
