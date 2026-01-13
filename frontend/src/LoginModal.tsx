import React, { useState } from 'react';
import { LogIn, X, Loader, Lock, User, Mail } from 'lucide-react';
import { buildApiUrl } from './api-config';
import { useSettings } from './SettingsContext';

interface LoginModalProps {
    show: boolean;
    onClose: () => void;
    onLoginSuccess: (token: string, username: string, isAdmin: boolean) => void;
    isSignupMode?: boolean;
    onToggleMode?: (isSignup: boolean) => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ 
    show, 
    onClose, 
    onLoginSuccess, 
    isSignupMode = false,
    onToggleMode 
}) => {
    const { darkMode } = useSettings();
    const [isSignup, setIsSignup] = useState(isSignupMode);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    // Sync internal state with prop
    React.useEffect(() => {
        setIsSignup(isSignupMode);
    }, [isSignupMode]);

    // Control visibility for smooth exit animation
    React.useEffect(() => {
        if (show) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [show]);

    // Add dynamic placeholder styling for inputs
    React.useEffect(() => {
        if (show) {
            const style = document.createElement('style');
            style.textContent = `
                .login-input::placeholder {
                    color: var(--input-text);
                    opacity: 0.5;
                }
            `;
            document.head.appendChild(style);
            return () => {
                document.head.removeChild(style);
            };
        }
    }, [show]);

    // Control visibility for smooth exit animation
    React.useEffect(() => {
        if (show) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [show]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (isSignup && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        
        setLoading(true);

        try {
            const endpoint = isSignup ? buildApiUrl('/api/auth/register') : buildApiUrl('/api/auth/login');
            const body = isSignup 
                ? JSON.stringify({ username, password, email: email || undefined })
                : JSON.stringify({ username, password });

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body,
            });

            const data = await response.json();

            if (response.ok) {
                if (isSignup) {
                    // After successful signup, automatically log in
                    setError(null);
                    setIsSignup(false);
                    // Could auto-login here, but for now let user login manually
                    setPassword('');
                    setConfirmPassword('');
                    setEmail('');
                    alert('Account created! Please log in.');
                } else {
                    // Store the token and user info
                    localStorage.setItem('auth_token', data.access_token);
                    localStorage.setItem('username', data.username);
                    localStorage.setItem('is_admin', String(data.is_admin));
                    onLoginSuccess(data.access_token, data.username, data.is_admin);
                    onClose();
                    setUsername('');
                    setPassword('');
                }
            } else {
                setError(data.detail || (isSignup ? 'Signup failed' : 'Login failed'));
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        const newMode = !isSignup;
        setIsSignup(newMode);
        setError(null);
        setPassword('');
        setConfirmPassword('');
        setEmail('');
        if (onToggleMode) {
            onToggleMode(newMode);
        }
    };

    if (!show && !isVisible) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center" 
            style={{ 
                backgroundColor: show 
                  ? (darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)')
                  : 'rgba(0, 0, 0, 0)',
                backdropFilter: 'blur(8px)',
                opacity: show ? 1 : 0,
                pointerEvents: show ? 'auto' : 'none',
                transition: 'opacity 300ms ease-in-out, background-color 300ms ease-in-out',
            }}
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-md p-8 m-4 border shadow-2xl rounded-2xl" 
                style={{
                    backgroundColor: 'var(--glass-bg)',
                    borderColor: 'var(--glass-border)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(25px)',
                    animation: show ? 'modalSlideIn 0.3s ease-out' : 'none',
                    transform: show ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
                    opacity: show ? 1 : 0,
                    transition: 'all 300ms ease-in-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute transition-colors top-4 right-4 hover:opacity-70"
                    style={{ color: 'var(--text-color)' }}
                    aria-label="Close"
                >
                    <X size={24} />
                </button>

                {/* Header */}
                <div className="flex items-center justify-center mb-6">
                    <div className="p-3 mr-3 rounded-full" style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', border: '1px solid' }}>
                        <Lock style={{ color: 'var(--primary-color)' }} size={28} />
                    </div>
                    <h2 className="text-3xl font-bold" style={{ color: 'var(--text-color)' }}>
                        {isSignup ? 'Create Account' : 'Welcome Back'}
                    </h2>
                </div>

                <p className="mb-6 text-center" style={{ color: 'var(--text-color)', opacity: 0.7 }}>
                    {isSignup ? 'Join to save your favorite products' : 'Sign in to access your saved products'}
                </p>

                {/* Error message */}
                {error && (
                    <div className="p-3 mb-4 border rounded-lg" style={{ 
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        borderColor: 'rgba(239, 68, 68, 0.5)',
                    }}>
                        <p style={{ color: 'rgba(239, 68, 68, 0.9)', fontSize: '0.875rem' }}>{error}</p>
                    </div>
                )}

                {/* Login/Signup form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-color)' }}>
                            <User className="inline mr-2" size={16} />
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                            required
                            disabled={loading}
                            style={{
                                backgroundColor: 'var(--input-bg)',
                                borderColor: 'var(--input-border)',
                                color: 'var(--input-text)',
                                caretColor: 'var(--primary-color)',
                            } as React.CSSProperties & { '--placeholder-color': string }}
                            className="w-full p-3 border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed login-input"
                            onFocus={(e) => {
                                e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`;
                                e.currentTarget.style.borderColor = 'var(--primary-color)';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.borderColor = 'var(--input-border)';
                            }}
                        />
                    </div>

                    {isSignup && (
                        <div>
                            <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-color)' }}>
                                <Mail className="inline mr-2" size={16} />
                                Email <span style={{ color: 'var(--text-color)', opacity: 0.5 }}>(optional)</span>
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter email"
                                disabled={loading}
                                style={{
                                    backgroundColor: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--input-text)',
                                    caretColor: 'var(--primary-color)',
                                }}
                                className="w-full p-3 border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed login-input"
                                onFocus={(e) => {
                                    e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`;
                                    e.currentTarget.style.borderColor = 'var(--primary-color)';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.borderColor = 'var(--input-border)';
                                }}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-color)' }}>
                            <Lock className="inline mr-2" size={16} />
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            required
                            disabled={loading}
                            style={{
                                backgroundColor: 'var(--input-bg)',
                                borderColor: 'var(--input-border)',
                                color: 'var(--input-text)',
                                caretColor: 'var(--primary-color)',
                            }}
                            className="w-full p-3 border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            onFocus={(e) => {
                                e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`;
                                e.currentTarget.style.borderColor = 'var(--primary-color)';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.borderColor = 'var(--input-border)';
                            }}
                        />
                    </div>

                    {isSignup && (
                        <div>
                            <label className="block mb-2 text-sm font-semibold" style={{ color: 'var(--text-color)' }}>
                                <Lock className="inline mr-2" size={16} />
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm password"
                                required
                                disabled={loading}
                                style={{
                                    backgroundColor: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--input-text)',
                                    caretColor: 'var(--primary-color)',
                                }}
                                className="w-full p-3 border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed login-input"
                                onFocus={(e) => {
                                    e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`;
                                    e.currentTarget.style.borderColor = 'var(--primary-color)';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.borderColor = 'var(--input-border)';
                                }}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            backgroundColor: 'var(--button-bg)',
                            color: 'var(--button-text)',
                            borderColor: 'var(--glass-border)',
                        }}
                        className="flex items-center justify-center w-full px-6 py-3 font-semibold transition-all transform border rounded-lg shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {loading ? (
                            <>
                                <Loader className="mr-2 animate-spin" size={20} />
                                {isSignup ? 'Creating account...' : 'Signing in...'}
                            </>
                        ) : (
                            <>
                                <LogIn className="mr-2" size={20} />
                                {isSignup ? 'Create Account' : 'Sign In'}
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={toggleMode}
                        className="text-sm transition-colors hover:opacity-70"
                        style={{ color: 'var(--primary-color)' }}
                        disabled={loading}
                    >
                        {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginModal;
