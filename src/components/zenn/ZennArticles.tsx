'use client';

import { useState, useEffect } from 'react';
import { ZennArticleCard } from './ZennArticleCard';
import { ZennArticleSkeleton } from './ZennArticleSkeleton';
import { parseRSS } from '../../utils/rss-parser';
import type { ZennArticle } from '../../types/zenn';

const ZENN_RSS_URL = 'https://zenn.dev/kuma8088/feed';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const ITEMS_PER_PAGE = 6;

/**
 * Get the RSS URL with CORS proxy if needed
 */
function getRssUrl(): string {
  return `${CORS_PROXY}${encodeURIComponent(ZENN_RSS_URL)}`;
}

/**
 * Main container component for Zenn articles section
 * Fetches RSS feed and displays articles in a paginated grid
 */
export function ZennArticles() {
  const [allArticles, setAllArticles] = useState<ZennArticle[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.ceil(allArticles.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentArticles = allArticles.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const fetchArticles = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const url = getRssUrl();
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }
      const xml = await res.text();
      const parsed = parseRSS(xml);
      setAllArticles(parsed.items);
      setCurrentPage(1);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(`記事の読み込みに失敗しました: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const goToPage = (page: number): void => {
    setCurrentPage(page);
    // Scroll to section top
    document.getElementById('blog')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="blog" className="py-24 bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#1e1e1e] mb-4">Blog</h2>
          <p className="text-[#525252] max-w-3xl mx-auto">
            技術ブログで発信している記事の一覧です。AWS、インフラ、開発手法などについて書いています。
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchArticles}
              className="px-8 py-3 bg-[#7c3aed] text-white rounded-lg
                       hover:bg-[#6d28d9] transition-colors
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
            >
              再読み込み
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
              <ZennArticleSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Articles grid */}
        {!loading && !error && currentArticles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentArticles.map((article) => (
              <ZennArticleCard key={article.link} article={article} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && allArticles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#525252]">記事がまだありません。</p>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            {/* Previous button */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg border border-[#e5e5e5] bg-white text-[#525252]
                       hover:border-[#7c3aed] hover:text-[#7c3aed] transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#e5e5e5] disabled:hover:text-[#525252]
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
              aria-label="前のページ"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            {/* Page numbers */}
            {Array.from({ length: totalPages }).map((_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-10 h-10 rounded-lg font-medium transition-colors
                            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]
                            ${currentPage === page
                              ? 'bg-[#7c3aed] text-white'
                              : 'border border-[#e5e5e5] bg-white text-[#525252] hover:border-[#7c3aed] hover:text-[#7c3aed]'
                            }`}
                  aria-label={`ページ ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              );
            })}

            {/* Next button */}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg border border-[#e5e5e5] bg-white text-[#525252]
                       hover:border-[#7c3aed] hover:text-[#7c3aed] transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#e5e5e5] disabled:hover:text-[#525252]
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
              aria-label="次のページ"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {/* View all link */}
        {!loading && !error && allArticles.length > 0 && (
          <div className="text-center mt-8">
            <a
              href="https://zenn.dev/kuma8088"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[#7c3aed] font-medium
                       hover:underline
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
            >
              Zenn で全記事を見る
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
