'use client';

import { useState, useEffect } from 'react';
import { ZennArticleCard } from './ZennArticleCard';
import { ZennArticleSkeleton } from './ZennArticleSkeleton';
import { parseRSS } from '../../utils/rss-parser';
import type { ZennArticle } from '../../types/zenn';

const ITEMS_PER_PAGE = 6;

interface ZennArticlesProps {
  /** RSS feed XML fetched server-side */
  rssXml: string | null;
}

/**
 * Main container component for Zenn articles section
 * Displays articles from RSS feed in a paginated grid
 */
export function ZennArticles({ rssXml }: ZennArticlesProps) {
  const [allArticles, setAllArticles] = useState<ZennArticle[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.ceil(allArticles.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentArticles = allArticles.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      if (!rssXml) {
        throw new Error('RSS feed data is not available');
      }
      const parsed = parseRSS(rssXml);
      setAllArticles(parsed.items);
      setCurrentPage(1);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(`記事の読み込みに失敗しました: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [rssXml]);

  const goToPage = (page: number): void => {
    setCurrentPage(page);
    // Scroll to section top
    document.getElementById('blog')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="blog" className="py-24 bg-[var(--color-bg-tertiary)]">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[var(--color-text)] mb-4">Blog</h2>
          <p className="text-[var(--color-text-secondary)] max-w-3xl mx-auto">
            技術ブログで発信している記事の一覧です。AWS、インフラ、開発手法などについて書いています。
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <p className="text-[var(--color-text-secondary)] text-sm mb-3">
              一時的なエラーの可能性があります。ページを再読み込みしてください。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg
                       hover:bg-[var(--color-accent-hover)] transition-colors text-sm
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
            <p className="text-[var(--color-text-secondary)]">記事がまだありません。</p>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            {/* Previous button */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]
                       hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-secondary)]
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
                            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]
                            ${currentPage === page
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
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
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]
                       hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-secondary)]
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
              className="inline-flex items-center gap-2 text-[var(--color-accent)] font-medium
                       hover:underline
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
