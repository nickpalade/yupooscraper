import React, { useState } from 'react';
import { LogIn, X, Loader, Lock, User, Mail } from 'lucide-react';

interface LoginModalProps {
    show: boolean;
    onClose: () => void;
    onLoginSuccess: (token: string, username: string, isAdmin: boolean) => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ show, onClose, onLoginSuccess }) => {
    const [isSignup, setIsSignup] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (isSignup && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        
        setLoading(true);

        try {
            const endpoint = isSignup ? '/api/auth/register' : '/api/auth/login';
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
        setIsSignup(!isSignup);
        setError(null);
        setPassword('');
        setConfirmPassword('');
        setEmail('');
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-8 m-4 border shadow-2xl backdrop-blur-xl bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-white/20 rounded-2xl">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute text-white transition-colors top-4 right-4 hover:text-red-400"
                    aria-label="Close"
                >
                    <X size={24} />
                </button>

                {/* Header */}
                <div className="flex items-center justify-center mb-6">
                    <div className="p-3 mr-3 rounded-full bg-white/10">
                        <Lock className="text-blue-400" size={28} />
                    </div>
                    <h2 className="text-3xl font-bold text-white">
                        {isSignup ? 'Create Account' : 'Welcome Back'}
                    </h2>
                </div>

                <p className="mb-6 text-center text-white/70">
                    {isSignup ? 'Join to save your favorite products' : 'Sign in to access your saved products'}
                </p>

                {/* Error message */}
                {error && (
                    <div className="p-3 mb-4 border rounded-lg bg-red-500/20 border-red-500/50">
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                )}

                {/* Login/Signup form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-2 text-sm font-semibold text-white">
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
                            className="w-full p-3 text-white border rounded-lg backdrop-blur-md bg-white/10 border-white/20 placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-lg focus:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>

                    {isSignup && (
                        <div>
                            <label className="block mb-2 text-sm font-semibold text-white">
                                <Mail className="inline mr-2" size={16} />
                                Email <span className="text-white/50">(optional)</span>
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter email"
                                disabled={loading}
                                className="w-full p-3 text-white border rounded-lg backdrop-blur-md bg-white/10 border-white/20 placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-lg focus:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block mb-2 text-sm font-semibold text-white">
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
                            className="w-full p-3 text-white border rounded-lg backdrop-blur-md bg-white/10 border-white/20 placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-lg focus:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>

                    {isSignup && (
                        <div>
                            <label className="block mb-2 text-sm font-semibold text-white">
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
                                className="w-full p-3 text-white border rounded-lg backdrop-blur-md bg-white/10 border-white/20 placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-lg focus:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center justify-center w-full px-6 py-3 font-semibold text-white transition-all transform bg-blue-600 rounded-lg shadow-lg hover:bg-blue-700 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
                        className="text-sm text-blue-300 transition-colors hover:text-blue-200"
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
