import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, PenSquare, ExternalLink } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Product } from './types';
import ProductCard from './ProductCard';
import { buildApiUrl } from './api-config';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from './SettingsContext';

interface MyListsProps {
    authToken: string | null;
    isAuthenticated: boolean;
    onLoginRequired: () => void;
    onImageClick: (image: string, title: string, productId?: number) => void;
    onSimilarSearch: (product: Product, sameBrand: boolean) => void;
    mobileGridCols: number;
    setMobileGridCols: (cols: number) => void;
    onListProductsChange: (products: Product[]) => void;
}

interface List {
    list_id: number;
    list_name: string;
}

interface SavedProduct {
    saved_product_id: number;
    product: Product;
    notes: string | null;
    saved_at: string;
}

const MyLists: React.FC<MyListsProps> = ({ authToken, isAuthenticated, onLoginRequired, onImageClick, onSimilarSearch, mobileGridCols, setMobileGridCols, onListProductsChange }) => {
    const { darkMode } = useSettings();
    const { listName } = useParams<{ listName?: string }>();
    const navigate = useNavigate();
    const [lists, setLists] = useState<List[]>([]);
    const [selectedListId, setSelectedListId] = useState<number | null>(null);
    const [listNotFound, setListNotFound] = useState(false);
    const [products, setProducts] = useState<SavedProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [renameListName, setRenameListName] = useState('');
    const [editingListId, setEditingListId] = useState<number | null>(null);
    const [deletingListId, setDeleteingListId] = useState<number | null>(null);
    const [editingNotes, setEditingNotes] = useState('');
    const [editingSavedProductId, setEditingSavedProductId] = useState<number | null>(null);
    const [removingProductId, setRemovingProductId] = useState<number | null>(null);
    const [showRemoveProductConfirm, setShowRemoveProductConfirm] = useState(false);

    // Visibility states for exit animations
    const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
    const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
    const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
    const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);

    // Handle visibility for exit animations
    useEffect(() => {
        if (showCreateModal) {
            setIsCreateModalVisible(true);
        } else {
            const timer = setTimeout(() => setIsCreateModalVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [showCreateModal]);

    useEffect(() => {
        if (showRenameModal) {
            setIsRenameModalVisible(true);
        } else {
            const timer = setTimeout(() => setIsRenameModalVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [showRenameModal]);

    useEffect(() => {
        if (showDeleteConfirm) {
            setIsDeleteConfirmVisible(true);
        } else {
            const timer = setTimeout(() => setIsDeleteConfirmVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [showDeleteConfirm]);

    useEffect(() => {
        if (showNotesModal) {
            setIsNotesModalVisible(true);
        } else {
            const timer = setTimeout(() => setIsNotesModalVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [showNotesModal]);

    useEffect(() => {
        if (isAuthenticated && authToken) {
            loadLists();
        }
    }, [isAuthenticated, authToken]);

    // Sync selectedListId with URL params
    useEffect(() => {
        if (lists.length === 0) return;
        
        if (listName) {
            // Find list by name from URL
            const list = lists.find(l => encodeURIComponent(l.list_name.toLowerCase().replace(/\s+/g, '-')) === listName);
            if (list) {
                setSelectedListId(list.list_id);
                setListNotFound(false);
            } else {
                // List doesn't exist, show error and redirect
                setListNotFound(true);
                setTimeout(() => {
                    navigate('/lists');
                }, 2000);
            }
        } else {
            // No list in URL, select first list and update URL
            if (lists.length > 0 && !selectedListId) {
                const firstList = lists[0];
                const urlName = encodeURIComponent(firstList.list_name.toLowerCase().replace(/\s+/g, '-'));
                navigate(`/lists/${urlName}`, { replace: true });
            }
        }
    }, [listName, lists, navigate]);

    useEffect(() => {
        if (selectedListId && authToken) {
            loadListProducts(selectedListId);
        }
    }, [selectedListId, authToken]);

    const loadLists = async () => {
        setLoading(true);
        try {
            const response = await axios.get(buildApiUrl('/api/user/lists'), {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            setLists(response.data.lists);
        } catch (error) {
            console.error('Failed to load lists:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadListProducts = async (listId: number) => {
        setLoading(true);
        try {
            const response = await axios.get(buildApiUrl(`/api/user/lists/${listId}/products`), {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const loadedProducts = response.data.products.map((sp: SavedProduct) => sp.product);
            setProducts(response.data.products);
            onListProductsChange(loadedProducts);
        } catch (error) {
            console.error('Failed to load products:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newListName.trim()) return;

        try {
            const response = await axios.post(buildApiUrl('/api/user/lists'), {
                list_name: newListName.trim()
            }, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            const newList = { 
                list_id: response.data.list_id, 
                list_name: response.data.list_name 
            };
            setLists(prev => [...prev, newList]);
            setNewListName('');
            setShowCreateModal(false);
            // Navigate to new list
            const urlName = encodeURIComponent(newList.list_name.toLowerCase().replace(/\s+/g, '-'));
            navigate(`/lists/${urlName}`);
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Failed to create list');
        }
    };

    const handleRenameList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renameListName.trim() || !editingListId) return;

        try {
            await axios.put(buildApiUrl(`/api/user/lists/${editingListId}`), {
                list_name: renameListName.trim()
            }, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            const updatedLists = lists.map(list => 
                list.list_id === editingListId 
                    ? { ...list, list_name: renameListName.trim() }
                    : list
            );
            setLists(updatedLists);
            
            // If renamed list is selected, update URL
            if (selectedListId === editingListId) {
                const urlName = encodeURIComponent(renameListName.trim().toLowerCase().replace(/\s+/g, '-'));
                navigate(`/lists/${urlName}`, { replace: true });
            }
            
            setShowRenameModal(false);
            setRenameListName('');
            setEditingListId(null);
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Failed to rename list');
        }
    };

    const handleDeleteList = async () => {
        if (!deletingListId) return;

        try {
            await axios.delete(buildApiUrl(`/api/user/lists/${deletingListId}`), {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            const remainingLists = lists.filter(list => list.list_id !== deletingListId);
            setLists(remainingLists);
            
            if (selectedListId === deletingListId) {
                if (remainingLists.length > 0) {
                    const urlName = encodeURIComponent(remainingLists[0].list_name.toLowerCase().replace(/\s+/g, '-'));
                    navigate(`/lists/${urlName}`, { replace: true });
                } else {
                    navigate('/lists', { replace: true });
                }
            }
            
            setShowDeleteConfirm(false);
            setDeleteingListId(null);
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Failed to delete list');
        }
    };

    const handleRemoveProduct = async (productId: number) => {
        if (!selectedListId) return;
        
        setRemovingProductId(productId);
        setShowRemoveProductConfirm(true);
    };

    const confirmRemoveProduct = async () => {
        if (!selectedListId || removingProductId === null) return;

        try {
            await axios.delete(buildApiUrl(`/api/user/lists/${selectedListId}/products/${removingProductId}`), {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            setProducts(prev => prev.filter(p => p.product.id !== removingProductId));
            const updatedProducts = products.filter(p => p.product.id !== removingProductId).map(sp => sp.product);
            onListProductsChange(updatedProducts);
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Failed to remove product');
        } finally {
            setRemovingProductId(null);
        }
    };

    const handleUpdateNotes = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingSavedProductId === null) return;

        try {
            await axios.put(buildApiUrl(`/api/user/saved-products/${editingSavedProductId}/notes`), {
                notes: editingNotes
            }, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            setProducts(prev => prev.map(p => 
                p.saved_product_id === editingSavedProductId
                    ? { ...p, notes: editingNotes }
                    : p
            ));
            setShowNotesModal(false);
            setEditingNotes('');
            setEditingSavedProductId(null);
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Failed to update notes');
        }
    };

    const openNotesModal = (savedProductId: number, currentNotes: string | null) => {
        setEditingSavedProductId(savedProductId);
        setEditingNotes(currentNotes || '');
        setShowNotesModal(true);
    };

    const handleListClick = (list: List) => {
        const urlName = encodeURIComponent(list.list_name.toLowerCase().replace(/\s+/g, '-'));
        navigate(`/lists/${urlName}`);
    };

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-8">
                <div 
                    className="max-w-md p-8 text-center border rounded-2xl backdrop-blur-2xl border-white/30"
                    style={{
                        backgroundColor: 'var(--card-bg)',
                        boxShadow: `0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                    }}
                >
                    <h2 style={{ color: 'var(--text-color)' }} className="mb-4 text-2xl font-bold">Login Required</h2>
                    <p style={{ color: 'var(--text-color)' }} className="mb-6 opacity-70">Please login to view and manage your saved products</p>
                    <button
                        onClick={onLoginRequired}
                        style={{
                            backgroundColor: 'var(--button-bg)',
                            color: 'var(--button-text)'
                        }}
                        className="px-6 py-3 font-semibold transition-all rounded-lg hover:opacity-90"
                    >
                        Login / Sign Up
                    </button>
                </div>
            </div>
        );
    }

    const selectedList = lists.find(l => l.list_id === selectedListId);

    return (
        <div className="container px-4 py-8 mx-auto">
            <h1 style={{ color: 'var(--text-color)' }} className="mb-8 text-3xl font-bold">My Lists</h1>

            {listNotFound && (
                <div className="p-4 mb-6 border rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--text-color)' }}>
                    <p className="font-semibold">❌ List not found</p>
                    <p className="text-sm opacity-75">The list you're looking for doesn't exist</p>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-4">
                {/* Lists Sidebar */}
                <div className="lg:col-span-1">
                    <div 
                        className="p-4 overflow-hidden border rounded-xl backdrop-blur-2xl border-white/30"
                        style={{
                            backgroundColor: 'var(--card-bg)',
                            boxShadow: `0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-color)' }}>Your Lists</h2>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                style={{
                                    backgroundColor: 'var(--button-bg)',
                                    borderColor: 'var(--glass-border)',
                                    color: 'var(--button-text)'
                                }}
                                className="p-2 transition-all border rounded-lg hover:opacity-90 hover:shadow-lg"
                                title="Create new list"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        {lists.length === 0 ? (
                            <p style={{ color: 'var(--text-color)' }} className="text-sm text-center opacity-60">No lists yet</p>
                        ) : (
                            <div className="space-y-2">
                                {lists.map(list => (
                                    <div
                                        key={list.list_id}
                                        style={{
                                            backgroundColor: selectedListId === list.list_id ? 'var(--glass-bg)' : 'rgba(255, 255, 255, 0.05)',
                                            borderColor: selectedListId === list.list_id ? 'var(--glass-border)' : 'rgba(255, 255, 255, 0.1)'
                                        }}
                                        className={`p-3 rounded-lg transition-all cursor-pointer group border hover:bg-opacity-75 backdrop-blur-md`}
                                        onClick={() => handleListClick(list)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span style={{ color: selectedListId === list.list_id ? 'var(--primary-color)' : 'var(--text-color)' }} className={`${selectedListId === list.list_id ? 'font-semibold' : ''}`}>{list.list_name}</span>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingListId(list.list_id);
                                                        setRenameListName(list.list_name);
                                                        setShowRenameModal(true);
                                                    }}
                                                    className="p-1 text-white transition-colors rounded hover:bg-white/20"
                                                    title="Rename"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteingListId(list.list_id);
                                                        setShowDeleteConfirm(true);
                                                    }}
                                                    className="p-1 text-red-400 transition-colors rounded hover:bg-red-500/20"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Products Grid */}
                <div className="lg:col-span-3">
                    {selectedList ? (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-color)' }}>{selectedList.list_name}</h2>
                                <div className="flex items-center gap-2 p-1 rounded-lg md:hidden" style={{ backgroundColor: 'var(--card-bg)' }}>
                                    <span className="ml-2 text-sm font-medium font-semibold" style={{ color: 'var(--text-color)' }}>WIDTH:</span>
                                    <button onClick={() => setMobileGridCols(1)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors glass-button ${mobileGridCols === 1 ? 'shadow' : ''}`} style={{ backgroundColor: mobileGridCols === 1 ? 'var(--primary-color)' : 'transparent', color: mobileGridCols === 1 ? 'var(--button-text)' : 'var(--text-color)', borderColor: 'var(--glass-border)' }}>1</button>
                                    <button onClick={() => setMobileGridCols(2)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors glass-button ${mobileGridCols === 2 ? 'shadow' : ''}`} style={{ backgroundColor: mobileGridCols === 2 ? 'var(--primary-color)' : 'transparent', color: mobileGridCols === 2 ? 'var(--button-text)' : 'var(--text-color)', borderColor: 'var(--glass-border)' }}>2</button>
                                    <button onClick={() => setMobileGridCols(3)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors glass-button ${mobileGridCols === 3 ? 'shadow' : ''}`} style={{ backgroundColor: mobileGridCols === 3 ? 'var(--primary-color)' : 'transparent', color: mobileGridCols === 3 ? 'var(--button-text)' : 'var(--text-color)', borderColor: 'var(--glass-border)' }}>3</button>
                                </div>
                            </div>
                            {loading ? (
                                <div className="text-center text-white">Loading...</div>
                            ) : products.length === 0 ? (
                                <div 
                                    className="p-8 text-center border rounded-xl backdrop-blur-2xl border-white/30"
                                    style={{
                                        backgroundColor: 'var(--card-bg)',
                                        boxShadow: `0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                                    }}
                                >
                                    <p style={{ color: 'var(--text-color)' }} className="opacity-70">No products in this list yet</p>
                                    <p style={{ color: 'var(--text-color)' }} className="mt-2 text-sm opacity-50">Browse products and click the bookmark icon to save them here</p>
                                </div>
                            ) : (
                                <div className={`grid gap-4 ${
                                    mobileGridCols === 1 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' :
                                    mobileGridCols === 2 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' :
                                    'grid-cols-3 md:grid-cols-4'
                                }`}>
                                    {products.map((savedProduct, index) => (
                                        <div key={savedProduct.saved_product_id} className="relative group">
                                            <ProductCard
                                                product={savedProduct.product}
                                                onImageClick={onImageClick}
                                                handleSimilarSearch={(sameBrand) => onSimilarSearch(savedProduct.product, sameBrand)}
                                                mobileGridCols={mobileGridCols}
                                                index={index}
                                                shouldAnimate={false}
                                                shouldShowInstantly={true}
                                                isScrolling={false}
                                                isHighlighted={false}
                                                highlighted={false}
                                                showSaveButton={false}
                                            />
                                            <div className="absolute flex gap-2 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 top-2 right-2">
                                                <button
                                                    onClick={() => openNotesModal(savedProduct.saved_product_id, savedProduct.notes)}
                                                    style={{
                                                        backgroundColor: savedProduct.notes ? 'var(--accent-color)' : 'var(--glass-bg)',
                                                        borderColor: 'var(--glass-border)',
                                                        color: savedProduct.notes ? 'var(--secondary-color)' : 'var(--text-color)',
                                                        boxShadow: `0 4px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                                                    }}
                                                    className="p-2 transition-all border rounded-lg shadow-lg backdrop-blur-md hover:opacity-80"
                                                    title={savedProduct.notes ? 'Edit notes' : 'Add notes'}
                                                >
                                                    <PenSquare size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveProduct(savedProduct.product.id)}
                                                    style={{
                                                        backgroundColor: 'var(--glass-bg)',
                                                        borderColor: 'var(--glass-border)',
                                                        boxShadow: `0 4px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                                                    }}
                                                    className="p-2 text-red-400 transition-all border rounded-lg shadow-lg backdrop-blur-md hover:bg-red-500/20 hover:border-red-400/30 hover:text-red-300"
                                                    title="Remove from list"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                            {savedProduct.notes && (
                                                <div 
                                                    style={{
                                                        backgroundColor: 'var(--accent-color)',
                                                        borderColor: 'var(--glass-border)',
                                                        boxShadow: `0 4px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.05)`
                                                    }}
                                                    className="p-3 mt-2 text-sm border rounded-lg backdrop-blur-md"
                                                >
                                                    <p style={{ color: 'var(--text-color)' }}>{savedProduct.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div 
                            className="p-8 text-center border rounded-xl backdrop-blur-2xl border-white/30"
                            style={{
                                backgroundColor: 'var(--card-bg)',
                                boxShadow: `0 8px 32px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                            }}
                        >
                            <p style={{ color: 'var(--text-color)' }} className="opacity-70">Create a list to get started</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Create List Modal */}
            {(showCreateModal || isCreateModalVisible) && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{
                        backgroundColor: showCreateModal 
                          ? (darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)')
                          : 'rgba(0, 0, 0, 0)',
                        backdropFilter: 'blur(8px)',
                        opacity: showCreateModal ? 1 : 0,
                        pointerEvents: showCreateModal ? 'auto' : 'none',
                        transition: 'opacity 300ms ease-in-out, background-color 300ms ease-in-out',
                    }}
                    onClick={() => setShowCreateModal(false)}
                >
                    <div 
                        className="w-full max-w-md p-6 m-4 rounded-2xl"
                        style={{
                            backgroundColor: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(25px)',
                            animation: showCreateModal ? 'modalSlideIn 0.3s ease-out' : 'none',
                            transform: showCreateModal ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
                            opacity: showCreateModal ? 1 : 0,
                            transition: 'all 300ms ease-in-out',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 style={{ color: 'var(--text-color)' }} className="text-xl font-bold">Create New List</h3>
                            <button onClick={() => setShowCreateModal(false)} style={{ color: 'var(--text-color)' }} className="transition-opacity opacity-50 hover:opacity-80">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateList}>
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
                                className="w-full px-4 py-3 mb-4 transition-all border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2"
                                onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`}
                                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                            />
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={!newListName.trim()}
                                    style={{
                                        backgroundColor: 'var(--button-bg)',
                                        borderColor: 'var(--glass-border)',
                                        color: 'var(--button-text)'
                                    }}
                                    className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg disabled:opacity-50 hover:opacity-90 hover:shadow-lg"
                                >
                                    Create
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    style={{
                                        backgroundColor: 'var(--glass-bg)',
                                        borderColor: 'var(--glass-border)',
                                        color: 'var(--text-color)'
                                    }}
                                    className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg hover:opacity-75"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Rename List Modal */}
            {(showRenameModal || isRenameModalVisible) && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{
                        backgroundColor: showRenameModal 
                          ? (darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)')
                          : 'rgba(0, 0, 0, 0)',
                        backdropFilter: 'blur(8px)',
                        opacity: showRenameModal ? 1 : 0,
                        pointerEvents: showRenameModal ? 'auto' : 'none',
                        transition: 'opacity 300ms ease-in-out, background-color 300ms ease-in-out',
                    }}
                    onClick={() => setShowRenameModal(false)}
                >
                    <div 
                        className="w-full max-w-md p-6 m-4 rounded-2xl"
                        style={{
                            backgroundColor: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(25px)',
                            animation: showRenameModal ? 'modalSlideIn 0.3s ease-out' : 'none',
                            transform: showRenameModal ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
                            opacity: showRenameModal ? 1 : 0,
                            transition: 'all 300ms ease-in-out',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 style={{ color: 'var(--text-color)' }} className="text-xl font-bold">Rename List</h3>
                            <button onClick={() => setShowRenameModal(false)} style={{ color: 'var(--text-color)' }} className="transition-opacity opacity-50 hover:opacity-80">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleRenameList}>
                            <input
                                type="text"
                                value={renameListName}
                                onChange={(e) => setRenameListName(e.target.value)}
                                placeholder="New list name"
                                autoFocus
                                style={{
                                    backgroundColor: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--input-text)',
                                    caretColor: 'var(--primary-color)'
                                }}
                                className="w-full px-4 py-3 mb-4 transition-all border rounded-lg backdrop-blur-md focus:outline-none focus:ring-2"
                                onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`}
                                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                            />
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={!renameListName.trim()}
                                    style={{
                                        backgroundColor: 'var(--button-bg)',
                                        borderColor: 'var(--glass-border)',
                                        color: 'var(--button-text)'
                                    }}
                                    className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg disabled:opacity-50 hover:opacity-90 hover:shadow-lg"
                                >
                                    Rename
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowRenameModal(false)}
                                    style={{
                                        backgroundColor: 'var(--glass-bg)',
                                        borderColor: 'var(--glass-border)',
                                        color: 'var(--text-color)'
                                    }}
                                    className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg hover:opacity-75"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {(showDeleteConfirm || isDeleteConfirmVisible) && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{
                        backgroundColor: showDeleteConfirm 
                          ? (darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)')
                          : 'rgba(0, 0, 0, 0)',
                        backdropFilter: 'blur(8px)',
                        opacity: showDeleteConfirm ? 1 : 0,
                        pointerEvents: showDeleteConfirm ? 'auto' : 'none',
                        transition: 'opacity 300ms ease-in-out, background-color 300ms ease-in-out',
                    }}
                    onClick={() => setShowDeleteConfirm(false)}
                >
                    <div 
                        className="w-full max-w-md p-6 m-4 rounded-2xl"
                        style={{
                            backgroundColor: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(25px)',
                            animation: showDeleteConfirm ? 'modalSlideIn 0.3s ease-out' : 'none',
                            transform: showDeleteConfirm ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
                            opacity: showDeleteConfirm ? 1 : 0,
                            transition: 'all 300ms ease-in-out',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ color: 'var(--text-color)' }} className="mb-4 text-xl font-bold">Delete List?</h3>
                        <p style={{ color: 'var(--text-color)' }} className="mb-6 opacity-70">
                            Are you sure you want to delete this list? All saved products in this list will be removed. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleDeleteList}
                                style={{
                                    backgroundColor: 'var(--secondary-color)',
                                    borderColor: 'var(--glass-border)',
                                    color: 'var(--button-text)'
                                }}
                                className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg hover:opacity-90 hover:shadow-lg"
                            >
                                Delete
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                style={{
                                    backgroundColor: 'var(--glass-bg)',
                                    borderColor: 'var(--glass-border)',
                                    color: 'var(--text-color)'
                                }}
                                className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg hover:opacity-75"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notes Modal */}
            {(showNotesModal || isNotesModalVisible) && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{
                        backgroundColor: showNotesModal 
                          ? (darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)')
                          : 'rgba(0, 0, 0, 0)',
                        backdropFilter: 'blur(8px)',
                        opacity: showNotesModal ? 1 : 0,
                        pointerEvents: showNotesModal ? 'auto' : 'none',
                        transition: 'opacity 300ms ease-in-out, background-color 300ms ease-in-out',
                    }}
                    onClick={() => setShowNotesModal(false)}
                >
                    <div 
                        className="w-full max-w-md p-6 m-4 rounded-2xl"
                        style={{
                            backgroundColor: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(25px)',
                            animation: showNotesModal ? 'modalSlideIn 0.3s ease-out' : 'none',
                            transform: showNotesModal ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
                            opacity: showNotesModal ? 1 : 0,
                            transition: 'all 300ms ease-in-out',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 style={{ color: 'var(--text-color)' }} className="text-xl font-bold">Product Notes</h3>
                            <button onClick={() => setShowNotesModal(false)} style={{ color: 'var(--text-color)' }} className="transition-opacity opacity-50 hover:opacity-80">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateNotes}>
                            <textarea
                                value={editingNotes}
                                onChange={(e) => setEditingNotes(e.target.value)}
                                placeholder="Add notes about this product..."
                                rows={4}
                                autoFocus
                                style={{
                                    backgroundColor: 'var(--input-bg)',
                                    borderColor: 'var(--input-border)',
                                    color: 'var(--input-text)',
                                    caretColor: 'var(--primary-color)'
                                }}
                                className="w-full px-4 py-3 mb-4 transition-all border rounded-lg resize-none backdrop-blur-md focus:outline-none focus:ring-2"
                                onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px var(--primary-color)`}
                                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                            />
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    style={{
                                        backgroundColor: 'var(--button-bg)',
                                        borderColor: 'var(--glass-border)',
                                        color: 'var(--button-text)'
                                    }}
                                    className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg hover:opacity-90 hover:shadow-lg"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowNotesModal(false)}
                                    style={{
                                        backgroundColor: 'var(--glass-bg)',
                                        borderColor: 'var(--glass-border)',
                                        color: 'var(--text-color)'
                                    }}
                                    className="flex-1 px-4 py-2 font-semibold transition-all border rounded-lg hover:opacity-75"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Remove Product Confirmation Dialog */}
            <ConfirmDialog
                isOpen={showRemoveProductConfirm}
                onClose={() => {
                    setShowRemoveProductConfirm(false);
                    setRemovingProductId(null);
                }}
                onConfirm={confirmRemoveProduct}
                title="Remove Product"
                message="Are you sure you want to remove this product from the list?"
                confirmText="Remove"
                cancelText="Cancel"
                isDanger={true}
            />
        </div>
    );
};

export default MyLists;
