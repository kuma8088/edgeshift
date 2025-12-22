/**
 * Zenn RSS feed article type definition
 */
export interface ZennArticle {
  /** Article title */
  title: string;
  /** Article URL on Zenn */
  link: string;
  /** Publication date (ISO 8601 format) */
  pubDate: string;
  /** Article description/excerpt */
  description: string;
  /** OGP image URL (optional) */
  enclosure?: string;
  /** Author name */
  creator: string;
}

/**
 * Parsed RSS feed result
 */
export interface ParsedRSS {
  /** List of articles */
  items: ZennArticle[];
  /** Last build date of the feed */
  lastBuildDate: string;
}
