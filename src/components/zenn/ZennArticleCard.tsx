import type { ZennArticle } from '../../types/zenn';
import { formatRelativeTime } from '../../utils/rss-parser';

interface Props {
  article: ZennArticle;
}

/**
 * Zenn article card component with OG image
 * Title is included in the OG image, so we only show relative time below
 */
export function ZennArticleCard({ article }: Props) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-white rounded-xl overflow-hidden border border-[#e5e5e5]
                 hover:border-[#7c3aed]/50 hover:shadow-xl
                 hover:-translate-y-1 transition-all duration-300
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
    >
      {/* OG Image (contains title) */}
      <div className="aspect-[1200/630] bg-[#1e1e1e] overflow-hidden">
        {article.enclosure ? (
          <img
            src={article.enclosure}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#404040] to-[#1e1e1e]">
            <span className="text-4xl">📝</span>
          </div>
        )}
      </div>

      {/* Footer: Relative time only */}
      <div className="px-4 py-3">
        <time dateTime={article.pubDate} className="text-sm text-[#a3a3a3]">
          {formatRelativeTime(article.pubDate)}
        </time>
      </div>
    </a>
  );
}
