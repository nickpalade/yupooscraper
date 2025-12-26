import React, { useState } from 'react';
import axios from 'axios';

interface Product {
  id: number;
  image_url: string;
  tags: string[];
  album_url: string;
}

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setProducts([]);
    try {
      const trimmed = query.trim();
      if (!trimmed) {
        setError('Please enter one or more tags');
        setLoading(false);
        return;
      }
      const response = await axios.get<Product[]>(`${apiBase}/api/products`, {
        params: { tags: trimmed },
      });
      setProducts(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'An error occurred while searching');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-6">Yupoo Product Search</h1>
      <form onSubmit={handleSearch} className="flex flex-col items-center mb-6 space-y-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter comma separated tags (e.g. color_red,brightness_dark)"
          className="w-full max-w-md p-3 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none"
          disabled={loading}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>
      {error && <p className="text-center text-red-500 mb-4">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow p-4 flex flex-col justify-between">
            <a href={product.album_url} target="_blank" rel="noopener noreferrer">
              <img src={product.image_url} alt="Product cover" className="w-full h-48 object-cover rounded" />
            </a>
            <div className="mt-2 text-sm text-gray-700">
              <p><span className="font-semibold">Tags:</span> {product.tags.join(', ')}</p>
            </div>
            <a
              href={product.album_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-blue-600 hover:underline text-sm"
            >
              View on Yupoo
            </a>
          </div>
        ))}
      </div>
      {products.length === 0 && !loading && !error && (
        <p className="text-center text-gray-500">No products to display. Try searching for some tags.</p>
      )}
    </div>
  );
};

export default App;