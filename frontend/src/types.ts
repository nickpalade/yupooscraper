export interface Product {
    id: number;
    image_url: string;
    image_path: string;
    album_title: string;
    translated_title: string;
    tags: string[];
    album_url: string;
    colors: { [colorName: string]: number };
}

export interface TagCategory {
    color: string[];
    type: string[];
    brand: string[]; // Changed from 'company' to 'brand'
}

export const formatTag = (tag: string): string => {
    let formatted = tag.replace(/^(color|type|company)_/, '');
    formatted = formatted
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    return formatted;
};

export const categorizeAndFormatTags = (tags: string[]): TagCategory => {
    const categories: TagCategory = {
        color: [],
        type: [],
        brand: [], // Changed from 'company' to 'brand'
    };

    tags.forEach(tag => {
        if (tag.startsWith('color_')) {
            categories.color.push(formatTag(tag));
        } else if (tag.startsWith('type_')) {
            categories.type.push(formatTag(tag));
        } else if (tag.startsWith('company_')) {
            categories.brand.push(formatTag(tag)); // Pushing to 'brand'
        }
    });

    return categories;
};
