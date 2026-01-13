import React, { useState, useEffect } from 'react';
import { Bookmark, BookMarked, Plus } from 'lucide-react';
import axios from 'axios';
import { buildApiUrl } from './api-config';

interface SaveButtonProps {
    productId: number;
    isAuthenticated: boolean;
    authToken: string | null;
    onLoginRequired: () => void;
    compact?: boolean;
    onHoverEnd?: () => void;
}

interface List {
    list_id: number;
    list_name: string;
}

const SaveButton: React.FC<SaveButtonProps> = ({ 
    productId, 
    isAuthenticated, 
    authToken,
    onLoginRequired,
    compact = false,
    onHoverEnd
}) => {
    const [showListMenu, setShowListMenu] = useState(false);
    const [lists, setLists] = useState<List[]>([]);
    const [savedLists, setSavedLists] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [newListName, setNewListName] = useState('');

    useEffect(() => {
        if (isAuthenticated && authToken) {
            loadUserLists();
            checkSavedStatus();
        }
    }, [isAuthenticated, authToken, productId]);

    // Reset state when hover ends
    useEffect(() => {
        return () => {
            setShowListMenu(false);
            setShowNewListInput(false);
            setNewListName('');
            if (onHoverEnd) {
                onHoverEnd();
            }
        };
    }, [onHoverEnd]);

    // Listen for product saves from other SaveButton instances
    useEffect(() => {
        const handleProductSaved = (event: CustomEvent) => {
            // Reload saved status if it's the same product
            if (event.detail.productId === productId) {
                checkSavedStatus();
            }
        };

        window.addEventListener('productSaved' as any, handleProductSaved);
        return () => window.removeEventListener('productSaved' as any, handleProductSaved);
    }, [productId, authToken]);

    const loadUserLists = async () => {
        try {
            const response = await axios.get(buildApiUrl('/api/user/lists'), {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            setLists(response.data.lists);
        } catch (error) {
            console.error('Failed to load lists:', error);
        }
    };

    const checkSavedStatus = async () => {
        try {
            const response = await axios.get(buildApiUrl(`/api/user/products/${productId}/saved-status`), {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            setSavedLists(response.data.lists);
        } catch (error) {
            console.error('Failed to check saved status:', error);
        }
    };

    const handleButtonClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!isAuthenticated) {
            onLoginRequired();
            return;
        }
        setShowListMenu(!showListMenu);
    };

    const handleSaveToList = async (listId: number, listName: string) => {
        setLoading(true);
        try {
            const isSaved = savedLists.includes(listName);
            
            if (isSaved) {
                // Unsave
                await axios.delete(buildApiUrl(`/api/user/lists/${listId}/products/${productId}`), {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                setSavedLists(prev => prev.filter(l => l !== listName));
            } else {
                // Save
                await axios.post(buildApiUrl('/api/user/saved-products'), {
                    list_id: listId,
                    product_id: productId,
                    notes: null
                }, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                setSavedLists(prev => [...prev, listName]);
            }
            // Dispatch event so other SaveButton instances can refresh
            window.dispatchEvent(new CustomEvent('productSaved', { detail: { productId } }));
        } catch (error: any) {
            console.error('Failed to save/unsave product:', error);
            alert(error.response?.data?.detail || 'Failed to update product');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newListName.trim()) return;

        setLoading(true);
        try {
            const response = await axios.post(buildApiUrl('/api/user/lists'), {
                list_name: newListName.trim()
            }, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            setLists(prev => [...prev, { 
                list_id: response.data.list_id, 
                list_name: response.data.list_name 
            }]);
            setNewListName('');
            setShowNewListInput(false);
            
            // Dispatch event so other SaveButton instances can refresh
            window.dispatchEvent(new CustomEvent('productSaved', { detail: { productId } }));
        } catch (error: any) {
            console.error('Failed to create list:', error);
            alert(error.response?.data?.detail || 'Failed to create list');
        } finally {
            setLoading(false);
        }
    };

    const isSaved = savedLists.length > 0;

    return (
        <div className="relative">
            <button
                onClick={handleButtonClick}
                onMouseDown={(e) => e.stopPropagation()}
                className={`flex items-center justify-center transition-all border rounded-xl backdrop-blur-md ${compact ? 'w-10 h-10' : 'w-14 h-14'}`}
                style={{
                    backgroundColor: isSaved ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.25)',
                    borderColor: 'var(--glass-border)',
                    color: 'var(--text-color)',
                    boxShadow: `0 4px 16px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                }}
                title={isAuthenticated ? (isSaved ? 'Saved' : 'Save to list') : 'Login to save'}
            >
                {isSaved ? (
                    <BookMarked size={compact ? 18 : 22} />
                ) : (
                    <Bookmark size={compact ? 18 : 22} />
                )}
            </button>

            {showListMenu && (
                <>
                    <div 
                        className="fixed inset-0 z-[9998] animate-fadeIn" 
                        onClick={() => setShowListMenu(false)}
                    />
                    <div 
                        className="absolute right-0 z-[9999] w-64 mt-2 border rounded-lg shadow-2xl backdrop-blur overflow-hidden animate-fadeIn"
                        style={{
                            backgroundColor: 'var(--card-bg)',
                            borderColor: 'var(--glass-border)',
                            boxShadow: `0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{
                            borderBottomColor: 'var(--glass-border)'
                        }} className="p-3 border-b">
                            <h3 style={{ color: 'var(--text-color)' }} className="font-semibold">Save to list</h3>
                        </div>
                        
                        <div className="max-h-64 overflow-y-auto">
                            {lists.length === 0 && !showNewListInput && (
                                <div style={{ color: 'var(--text-color)' }} className="p-4 text-sm text-center opacity-50">
                                    No lists yet. Create one!
                                </div>
                            )}
                            
                            {lists.map(list => {
                                const isInList = savedLists.includes(list.list_name);
                                return (
                                    <button
                                        key={list.list_id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSaveToList(list.list_id, list.list_name);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        disabled={loading}
                                        style={{
                                            color: isInList ? 'var(--primary-color)' : 'var(--text-color)',
                                            backgroundColor: isInList ? 'var(--glass-bg)' : 'transparent'
                                        }}
                                        className={`w-full px-4 py-2.5 text-left transition-all flex items-center justify-between disabled:opacity-50 ${
                                            isInList ? 'hover:bg-opacity-75' : 'hover:opacity-75'
                                        }`}
                                        style={{
                                            color: isInList ? 'var(--primary-color)' : 'var(--text-color)',
                                            backgroundColor: isInList ? 'var(--glass-bg)' : 'transparent',
                                            borderBottomColor: 'var(--glass-border)'
                                        }}
                                    >
                                        <span className="font-medium">{list.list_name}</span>
                                        {isInList && <BookMarked size={16} style={{ color: 'var(--primary-color)' }} />}
                                    </button>
                                );
                            })}
                        </div>

                        {showNewListInput ? (
                            <form onSubmit={handleCreateList} style={{
                                borderTopColor: 'var(--glass-border)'
                            }} className="p-3 border-t" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="text"
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                    placeholder="List name"
                                    autoFocus
                                    style={{
                                        backgroundColor: 'var(--input-bg)',
                                        borderColor: 'var(--input-border)',
                                        color: 'var(--input-text)',
                                        caretColor: 'var(--primary-color)'
                                    }}
                                    className="w-full px-3 py-2 mb-2 text-sm border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2 transition-all"
                                    onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`}
                                    onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={loading || !newListName.trim()}
                                        style={{
                                            backgroundColor: 'var(--button-bg)',
                                            borderColor: 'var(--glass-border)',
                                            color: 'var(--button-text)'
                                        }}
                                        className="flex-1 px-3 py-1.5 text-sm font-medium transition-all rounded-lg backdrop-blur-sm disabled:opacity-50 border hover:opacity-90 hover:shadow-lg"
                                    >
                                        Create
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowNewListInput(false);
                                            setNewListName('');
                                        }}
                                        style={{
                                            backgroundColor: 'var(--glass-bg)',
                                            borderColor: 'var(--glass-border)',
                                            color: 'var(--text-color)'
                                        }}
                                        className="flex-1 px-3 py-1.5 text-sm font-medium transition-all rounded-lg backdrop-blur-sm border hover:opacity-75"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowNewListInput(true);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                    color: 'var(--primary-color)',
                                    borderTopColor: 'var(--glass-border)'
                                }}
                                className="flex items-center justify-center w-full gap-2 px-4 py-3 text-sm font-medium transition-all border-t hover:opacity-80"
                            >
                                <Plus size={16} />
                                Create new list
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default SaveButton;
