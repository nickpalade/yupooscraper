import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search } from 'lucide-react';
import { useSettings } from './SettingsContext';
import type { AppSettings } from './SettingsContext';
import { Product, TagCategory, categorizeAndFormatTags } from './types';

interface ProductCardProps {
    product: Product;
    onImageClick: (image: string, title:string) => void;
    mobileGridCols: number;
    index: number;
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


const ProductCard: React.FC<ProductCardProps> = ({ product, onImageClick, mobileGridCols, index }) => {
    const [isFetchingLink, setIsFetchingLink] = useState(false);
    const { settings } = useSettings();
    const tagSettings = settings.tags;


    const handleImageClick = () => {
        const imageSrc = product.image_path ? product.image_path : product.image_url;
        onImageClick(imageSrc, product.album_title);
    };

    const handleAllChinaBuyClick = async () => {
        setIsFetchingLink(true);
        const mobileDevice = isMobile();

        try {
            const response = await axios.get<{ external_link: string }>(`/api/external-link?url=${encodeURIComponent(product.album_url)}`);
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
            className="flex flex-col overflow-hidden transition-shadow glass-container animate-fadeInUp"
            style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
                boxShadow: 'var(--card-shadow)',
                animationDelay: `${index * 50}ms`,
                animationFillMode: 'forwards',
                opacity: 0, // Start with opacity 0, animation will take it to 1
            }}
        >
            <div
                className="relative w-full overflow-hidden cursor-pointer aspect-square group"
                onClick={handleImageClick}
                style={{ backgroundColor: 'var(--card-bg)' }}
            >
                <img
                    src={product.image_path ? product.image_path : product.image_url}
                    alt={product.album_title || "Product cover"}
                    className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-110"
                    onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/400?text=Image+Not+Found';
                    }}
                    loading="lazy"
                />
                <div 
                    className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 group-hover:bg-opacity-30"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
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
                                                            className={`inline-block glass-button glow-${category} ${tagSizeClass} rounded whitespace-nowrap`}
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
                <div className="flex flex-col items-center gap-2 mt-auto md:flex-row">
                    <a
                        href={product.album_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full px-3 py-2 text-xs font-semibold text-center glass-button md:flex-1"
                        style={{
                            backgroundColor: 'var(--primary-color)',
                            color: 'var(--button-text)',
                            borderColor: 'var(--glass-border)',
                        }}
                    >
                        Yupoo
                    </a>
                    <button
                        onClick={handleAllChinaBuyClick}
                        disabled={isFetchingLink}
                        className="w-full px-3 py-2 text-xs font-semibold text-center glass-button md:flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            backgroundColor: 'var(--allchinabuy-color)',
                            color: 'var(--button-text)',
                            borderColor: 'var(--glass-border)',
                        }}
                    >
                        {isFetchingLink ? 'Fetching...' : 'AllChinaBuy'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ProductCard);
