import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search } from 'lucide-react';
import { useSettings } from './SettingsContext';
import type { AppSettings } from './SettingsContext';
import { Product, TagCategory, categorizeAndFormatTags } from './types';
import SaveButton from './SaveButton';
import { buildApiUrl, buildImageUrl } from './api-config';

interface ProductCardProps {
    product: Product;
    onImageClick: (image: string, title: string, productId?: number) => void;
    handleSimilarSearch: (product: Product, sameBrand: boolean) => void;
    mobileGridCols: number;
    index: number;
    shouldAnimate: boolean;
    shouldShowInstantly: boolean;
    isScrolling: boolean;
    isHighlighted?: boolean;
    highlighted?: boolean;
    isAuthenticated?: boolean;
    authToken?: string | null;
    onLoginRequired?: () => void;
    showSaveButton?: boolean;
    onImageLoaded?: (index: number) => void;
}

function buildAllChinaBuyUrl(productUrl: string): string {
    const base = 'https://www.allchinabuy.com/en/page/buy/';
    const params = new URLSearchParams({
        nTag: 'Home-search',
        from: 'search-input',
        _search: 'url',
        position: '',
        url: productUrl
    });
    return `${base}?${params.toString()}`;
}

// Helper function for mobile detection
const isMobile = (): boolean => {
    if (navigator.userAgentData) {
        return navigator.userAgentData.mobile;
    }
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android|ipad|iphone|ipod|windows phone/i.test(userAgent);
};


const ProductCard: React.FC<ProductCardProps> = ({ 
    product, 
    onImageClick, 
    handleSimilarSearch, 
    mobileGridCols, 
    index, 
    shouldAnimate, 
    shouldShowInstantly, 
    isScrolling, 
    isHighlighted,
    highlighted,
    isAuthenticated = false,
    authToken = null,
    onLoginRequired = () => {},
    showSaveButton = true,
    onImageLoaded = () => {}
}) => {
    const [isFetchingLink, setIsFetchingLink] = useState(false);
    const [pendingSimilarSearch, setPendingSimilarSearch] = useState<boolean | null>(null);
    const similarSearchTimeoutRef = React.useRef<number | null>(null);
    const { settings } = useSettings();
    const tagSettings = settings.tags;


    const handleImageClick = () => {
        const imageSrc = product.image_path ? buildImageUrl(product.image_path) : product.image_url;
        onImageClick(imageSrc, product.album_title, product.id);
    };

    const handleSimilarSearchClick = (sameBrand: boolean) => {
        // If already pending, execute the search
        if (pendingSimilarSearch === sameBrand) {
            handleSimilarSearch(product, sameBrand);
            setPendingSimilarSearch(null);
            if (similarSearchTimeoutRef.current) {
                clearTimeout(similarSearchTimeoutRef.current);
            }
        } else {
            // First click - set pending state
            setPendingSimilarSearch(sameBrand);
            // Reset pending state after 1.5 seconds if not clicked again
            if (similarSearchTimeoutRef.current) {
                clearTimeout(similarSearchTimeoutRef.current);
            }
            similarSearchTimeoutRef.current = window.setTimeout(() => {
                setPendingSimilarSearch(null);
            }, 1500);
        }
    };

    React.useEffect(() => {
        return () => {
            if (similarSearchTimeoutRef.current) {
                clearTimeout(similarSearchTimeoutRef.current);
            }
        };
    }, []);

    const handleAllChinaBuyClick = async () => {
        setIsFetchingLink(true);
        const mobileDevice = isMobile();

        try {
            const response = await axios.get<{ external_link: string }>(buildApiUrl(`/api/external-link?url=${encodeURIComponent(product.album_url)}`));
            const externalLink = response.data.external_link;
            
            if (externalLink) {
                const allChinaBuyLink = buildAllChinaBuyUrl(externalLink);
                if (mobileDevice) {
                    window.location.href = allChinaBuyLink;
                } else {
                    const link = document.createElement('a');
                    link.href = allChinaBuyLink;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                alert('Could not find an external product link for this album.');
            }
        } catch (error) {
            console.error("Failed to fetch external link:", error);
            alert('Failed to fetch the external link. The Yupoo album may not contain a product link.');
        } finally {
            setIsFetchingLink(false);
        }
    };

    let tagSizeClass = "text-xs px-2 py-1";
    let labelSizeClass = "text-xs";
    let paddingClass = "p-4";

    if (mobileGridCols === 3) {
        tagSizeClass = "text-[10px] px-1 py-0.5 md:text-xs md:px-2 md:py-1";
        labelSizeClass = "text-[11px] md:text-xs";
        paddingClass = "p-2 md:p-4";
    } else if (mobileGridCols === 2) {
        tagSizeClass = "text-[11px] px-1.5 py-0.5 sm:text-xs sm:px-2 sm:py-1";
        labelSizeClass = "text-xs";
        paddingClass = "p-3 sm:p-4";
    }


    return (
        <div
            data-product-card
            data-index={index}
            data-product-id={product.id}
            className={`flex flex-col transition-all rounded-xl border ${shouldAnimate && !isScrolling && !shouldShowInstantly ? 'animate-fadeInUp' : ''} ${isHighlighted ? 'ring-8 ring-red-500' : ''}`}
            style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
                boxShadow: isHighlighted ? '0 0 20px rgba(239, 68, 68, 0.8), 0 0 35px rgba(239, 68, 68, 0.5), inset 0 0 15px rgba(239, 68, 68, 0.2)' : 'var(--card-shadow)',
                animation: isHighlighted && !(shouldAnimate && !isScrolling && !shouldShowInstantly) ? 'highlightFadeOut 2s ease-out forwards' : undefined,
                animationDelay: shouldAnimate && !isScrolling && !shouldShowInstantly ? `${index * 50}ms` : '0ms',
                animationFillMode: 'forwards',
                opacity: shouldShowInstantly || isScrolling ? 1 : 0,
                overflow: 'visible',
            }}
        >
            <div
                className="relative w-full aspect-square group"
                style={{ backgroundColor: 'var(--card-bg)', overflow: 'visible' }}
            >
                {showSaveButton && (
                    <div className="absolute z-20 transition-opacity duration-200 opacity-0 top-2 right-2 group-hover:opacity-100" onMouseLeave={() => window.dispatchEvent(new Event('saveButtonHoverEnd'))}>
                        <SaveButton
                            productId={product.id}
                            isAuthenticated={isAuthenticated}
                            authToken={authToken}
                            onLoginRequired={onLoginRequired}
                            compact={mobileGridCols >= 3}
                            onHoverEnd={() => {}}
                        />
                    </div>
                )}
                <img
                    src={product.image_path ? buildImageUrl(product.image_path) : product.image_url}
                    alt={product.album_title || "Product cover"}
                    className="object-cover w-full h-full transition-transform duration-300 cursor-pointer"
                    onClick={handleImageClick}
                    onLoad={() => onImageLoaded(index)}
                    onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/400?text=Image+Not+Found';
                        onImageLoaded(index); // Also mark as loaded on error
                    }}
                    loading="eager"
                />
                <div 
                    className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 pointer-events-none group-hover:bg-black/10"
                >
                    <Search size={40} className="transition-opacity duration-300 opacity-0 group-hover:opacity-100" style={{ color: 'var(--button-text)' }} />
                </div>
            </div>
            <div className={`flex flex-col flex-1 ${paddingClass}`}>
                {(() => {
                    const categories = categorizeAndFormatTags(product.tags);
                    const brandText = categories.brand.length > 0 ? categories.brand[0] : null;

                    return (
                        <>
                            {brandText && (
                                <h3 className="mb-2 text-sm font-semibold line-clamp-1" style={{ color: 'var(--text-color)' }}>
                                    {brandText}
                                </h3>
                            )}
                            {!brandText && product.album_title && (
                                <h3 className="mb-2 text-sm font-semibold line-clamp-2" style={{ color: 'var(--text-color)' }}>
                                    {product.album_title}
                                </h3>
                            )}
                        </>
                    );
                })()}

                <div className="mb-3">
                    {(() => {
                        const categories = categorizeAndFormatTags(product.tags);
                        const categoryLabels: Record<keyof TagCategory, string> = {
                            color: 'Color', type: 'Type', brand: 'Brand',
                        };

                        const SETTING_TO_CATEGORY_MAP: { [K in keyof AppSettings['tags']]: keyof TagCategory } = {
                            showColor: 'color',
                            showType: 'type',
                            showCompany: 'brand', // Changed from 'company' to 'brand'
                        };

                        const visibleCategories = (Object.keys(tagSettings) as Array<keyof AppSettings['tags']>)
                            .filter(key => tagSettings[key])
                            .map(key => SETTING_TO_CATEGORY_MAP[key]);

                        return (
                            <div className="space-y-2">
                                {visibleCategories.map((category) =>
                                    categories[category].length > 0 ? (
                                        <div key={category}>
                                            <p className={`mb-1 font-bold uppercase ${labelSizeClass}`} style={{ color: 'var(--text-color)' }}>
                                                {categoryLabels[category]}:
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {categories[category].map((tag, idx) => {
                                                    let percentage = null;
                                                    if (category === 'color' && product.colors) {
                                                        const colorNameLower = tag.toLowerCase();
                                                        for (const [colorKey, colorValue] of Object.entries(product.colors)) {
                                                            if (colorKey.toLowerCase() === colorNameLower) {
                                                                percentage = colorValue;
                                                                break;
                                                            }
                                                        }
                                                    }

                                                    return (
                                                        <span
                                                            key={idx}
                                                            className={`inline-block rounded border ${tagSizeClass} whitespace-nowrap`}
                                                            style={{
                                                                backgroundColor: `var(--tag-${category}-bg)`,
                                                                color: `var(--tag-${category}-text)`,
                                                                borderColor: `var(--tag-${category}-bg)`, // Border color same as background for a more unified look
                                                            }}
                                                            title={percentage !== null ? `${percentage.toFixed(1)}% of image` : ''}
                                                        >
                                                            {tag}
                                                            {percentage !== null && <span className="ml-1 font-semibold">({percentage.toFixed(0)}%)</span>}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : null
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default React.memo(ProductCard);
