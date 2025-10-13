import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.built.css';

// Type definitions
interface FinalNewsItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  url: string;
  original_language: string;
  source_domain: string;
  fetched_at: string;
  is_duplicate: boolean;
  thumbnail_url: string | null;
  published_at: string | null;
  site_icon_url: string | null;
  is_good: number | null;
}

interface DailyNewsData {
  date: string;
  fetched_at: string;
  keywords: string[];
  count: number;
  news: FinalNewsItem[];
  stats: {
    total_collected: number;
    unique_articles: number;
    duplicate_removed: number;
    iterations: number;
    duration_ms: number;
  };
  errors: Array<{ message: string; timestamp: string }>;
}

// Main App Component
function App() {
  const [datetimes, setDatetimes] = useState<string[]>([]);
  const [selectedDatetime, setSelectedDatetime] = useState<string | null>(null);
  const [newsData, setNewsData] = useState<DailyNewsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available datetimes on mount
  useEffect(() => {
    fetchDatetimes();
  }, []);

  // Fetch datetime list
  const fetchDatetimes = async () => {
    try {
      const response = await fetch('/api/dates');
      const data = await response.json() as { dates?: string[] };
      setDatetimes(data.dates || []);

      // Auto-select first datetime
      if (data.dates && data.dates.length > 0 && data.dates[0]) {
        setSelectedDatetime(data.dates[0]);
      }
    } catch (err) {
      setError('Failed to fetch datetime list');
      console.error(err);
    }
  };

  // Fetch news for selected datetime
  useEffect(() => {
    if (!selectedDatetime) return;

    const fetchNews = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/news/${selectedDatetime}`);
        if (!response.ok) {
          throw new Error('Failed to fetch news data');
        }
        const data = await response.json() as DailyNewsData;
        setNewsData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, [selectedDatetime]);

  // Group datetimes by date
  const groupedDatetimes = React.useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const datetime of datetimes) {
      const date = datetime.split('_')[0] || '';
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date]?.push(datetime);
    }
    return groups;
  }, [datetimes]);

  // Format datetime for display
  const formatDatetime = (datetime: string) => {
    const [date, time] = datetime.split('_');
    if (!time) return datetime;
    // Format: HH:mm:ss
    const formatted = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
    return formatted;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">CC Pulse</h1>
          <p className="text-sm text-gray-600 mt-1">AI-Powered News Aggregator</p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Datetime Selector */}
        <div className="mb-6">
          <label htmlFor="datetime-select" className="block text-sm font-medium text-gray-700 mb-2">
            Select Collection
          </label>
          <select
            id="datetime-select"
            value={selectedDatetime || ''}
            onChange={(e) => setSelectedDatetime(e.target.value)}
            className="block w-full sm:w-96 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {datetimes.length === 0 && (
              <option value="">No news data available</option>
            )}
            {Object.keys(groupedDatetimes).sort((a, b) => b.localeCompare(a)).map((date) => (
              <optgroup key={date} label={date}>
                {groupedDatetimes[date]?.map((datetime) => (
                  <option key={datetime} value={datetime}>
                    {formatDatetime(datetime)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* News Data */}
        {!loading && newsData && (
          <>
            {/* Meta Info */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Keywords</p>
                  <p className="font-semibold">{newsData.keywords.join(', ')}</p>
                </div>
                <div>
                  <p className="text-gray-600">Collected</p>
                  <p className="font-semibold">{newsData.stats.total_collected}</p>
                </div>
                <div>
                  <p className="text-gray-600">Unique</p>
                  <p className="font-semibold">{newsData.stats.unique_articles}</p>
                </div>
                <div>
                  <p className="text-gray-600">Duplicates</p>
                  <p className="font-semibold">{newsData.stats.duplicate_removed}</p>
                </div>
              </div>
            </div>

            {/* News Articles */}
            <div className="space-y-6">
              {newsData.news.length === 0 && (
                <p className="text-center text-gray-600 py-12">
                  No news available for this collection
                </p>
              )}
              {newsData.news.map((article, index) => (
                <ArticleCard key={index} article={article} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Article Card Component
function ArticleCard({ article }: { article: FinalNewsItem }) {
  // Initialize feedback state from article.is_good
  const initialFeedback = article.is_good === 1 ? 'good' : article.is_good === 0 ? 'bad' : null;
  const [feedbackState, setFeedbackState] = React.useState<'good' | 'bad' | null>(initialFeedback);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleGood = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: article.id,
          feedback: 'good',
        }),
      });

      if (response.ok) {
        setFeedbackState('good');
      } else {
        const error = await response.json();
        console.error('Feedback failed:', error);
        alert('Failed to save feedback: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Feedback error:', error);
      alert('Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBad = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: article.id,
          feedback: 'bad',
        }),
      });

      if (response.ok) {
        setFeedbackState('bad');
      } else {
        const error = await response.json();
        console.error('Feedback failed:', error);
        alert('Failed to save feedback: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Feedback error:', error);
      alert('Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString: string | null | undefined) => {
    if (!isoString) return 'Unknown';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <article className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-6">
        {/* Thumbnail and Title */}
        <div className="flex gap-4 mb-4">
          {article.thumbnail_url && (
            <img
              src={article.thumbnail_url}
              alt={article.title}
              className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {article.title}
            </h2>
            <div className="flex flex-wrap gap-2 text-sm text-gray-600 items-center">
              {article.site_icon_url && (
                <img
                  src={article.site_icon_url}
                  alt={`${article.source_domain} icon`}
                  className="w-4 h-4"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span>{article.source_domain}</span>
              <span>|</span>
              <span>{formatDate(article.published_at)}</span>
              <span>|</span>
              <span className="uppercase">{article.original_language}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <p className="text-gray-700 mb-4 leading-relaxed">
          {article.summary}
        </p>

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {article.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Read Article
            <svg
              className="ml-2 w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>

          {/* Feedback Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleGood}
              disabled={isSubmitting || feedbackState !== null}
              className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-md transition-colors ${
                feedbackState === 'good'
                  ? 'bg-green-100 border-green-600 text-green-700'
                  : 'border-green-600 text-green-600 hover:bg-green-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="This article was helpful"
            >
              Good
              {feedbackState === 'good' && ' ✓'}
            </button>
            <button
              onClick={handleBad}
              disabled={isSubmitting || feedbackState !== null}
              className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-md transition-colors ${
                feedbackState === 'bad'
                  ? 'bg-red-100 border-red-600 text-red-700'
                  : 'border-red-600 text-red-600 hover:bg-red-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="This article was not helpful"
            >
              Bad
              {feedbackState === 'bad' && ' ✓'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// Mount React app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
