import React, { useState } from 'react';
import axios from 'axios';
import { useSettings, AppSettings } from './SettingsContext';
import { Product, TagCategory, categorizeAndFormatTags } from './types';

interface ProductCardProps {
    product: Product;
    onImageClick: (image: string, title:string) => void;
    mobileGridCols: number;
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


const ProductCard: React.FC<ProductCardProps> = ({ product, onImageClick, mobileGridCols }) => {
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
            className="flex flex-col overflow-hidden transition-shadow bg-white rounded-lg shadow-md hover:shadow-xl"
        >
            <div
                className="relative w-full overflow-hidden bg-gray-100 cursor-pointer aspect-square group"
                onClick={handleImageClick}
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
                <div className="absolute inset-0 flex items-center justify-center transition-all duration-300 bg-black bg-opacity-0 group-hover:bg-opacity-30">
                    <span className="text-3xl text-white transition-opacity duration-300 opacity-0 group-hover:opacity-100">
                        🔍
                    </span>
                </div>
            </div>
            <div className={`flex flex-col flex-1 ${paddingClass}`}>
                {(() => {
                    const categories = categorizeAndFormatTags(product.tags);
                    const brandText = categories.company.length > 0 ? categories.company[0] : null;

                    return (
                        <>
                            {brandText && (
                                <h3 className="mb-2 text-sm font-semibold text-blue-900 line-clamp-1">
                                    {brandText}
                                </h3>
                            )}
                            {!brandText && product.album_title && (
                                <h3 className="mb-2 text-sm font-semibold text-gray-800 line-clamp-2">
                                    {product.album_title}
                                </h3>
                            )}
                        </>
                    );
                })()}

                <div className="mb-3">
                    {(() => {
                        const categories = categorizeAndFormatTags(product.tags);
                        const categoryColors: Record<keyof TagCategory, string> = {
                            color: 'bg-purple-100 text-purple-800',
                            type: 'bg-blue-100 text-blue-800',
                            company: 'bg-red-100 text-red-800',
                        };
                        const categoryLabels: Record<keyof TagCategory, string> = {
                            color: 'Color', type: 'Type', company: 'Brand',
                        };

                        const SETTING_TO_CATEGORY_MAP: { [K in keyof AppSettings['tags']]: keyof TagCategory } = {
                            showColor: 'color',
                            showType: 'type',
                            showCompany: 'company',
                        };

                        const visibleCategories = (Object.keys(tagSettings) as Array<keyof AppSettings['tags']>)
                            .filter(key => tagSettings[key])
                            .map(key => SETTING_TO_CATEGORY_MAP[key]);

                        return (
                            <div className="space-y-2">
                                {visibleCategories.map((category) =>
                                    categories[category].length > 0 ? (
                                        <div key={category}>
                                            <p className={`mb-1 font-bold text-gray-600 uppercase ${labelSizeClass}`}>
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
                                                            className={`inline-block ${categoryColors[category]} ${tagSizeClass} rounded whitespace-nowrap`}
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
                        className="w-full px-3 py-2 text-xs font-semibold text-center text-white transition-colors bg-blue-600 rounded md:flex-1 hover:bg-blue-700"
                    >
                        Yupoo
                    </a>
                    <button
                        onClick={handleAllChinaBuyClick}
                        disabled={isFetchingLink}
                        className="w-full px-3 py-2 text-xs font-semibold text-center text-white transition-colors bg-green-600 rounded md:flex-1 hover:bg-green-700 disabled:bg-gray-400"
                    >
                        {isFetchingLink ? 'Fetching...' : 'AllChinaBuy'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ProductCard);
