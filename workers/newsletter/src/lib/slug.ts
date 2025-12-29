/**
 * Slug Generation Utilities
 *
 * Converts newsletter titles to URL-safe slugs with date prefix.
 * Handles Japanese text (romanization), special characters, and uniqueness.
 */

/**
 * Simple Japanese to romaji mapping for common characters.
 * For production, consider using a full transliteration library.
 */
const JAPANESE_TO_ROMAJI: Record<string, string> = {
  // Hiragana
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',

  // Katakana
  'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
  'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
  'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
  'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
  'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
  'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
  'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
  'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
  'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
  'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n',
  // Small katakana
  'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo',

  // Common kanji (minimal set for testing)
  '年': 'year',
  '月': 'month',
};

/**
 * Convert Japanese characters to romaji.
 * Characters not in the mapping are removed.
 */
function toRomaji(text: string): string {
  return text
    .split('')
    .map(char => JAPANESE_TO_ROMAJI[char] || char)
    .join('');
}

/**
 * Generate a URL-safe slug from a newsletter title.
 *
 * Steps:
 * 1. Convert Japanese to romaji
 * 2. Lowercase all characters
 * 3. Remove special characters (keep alphanumeric and spaces)
 * 4. Replace spaces with hyphens
 * 5. Truncate to 80 characters
 * 6. Ensure uniqueness by checking database
 *
 * @param db - D1 database instance
 * @param title - Newsletter title (may contain Japanese)
 * @returns URL-safe unique slug
 *
 * @example
 * await generateSlug(db, 'Hello World Newsletter')
 * // => 'hello-world-newsletter'
 *
 * @example
 * await generateSlug(db, '2024年1月のニュース')
 * // => '2024-1-no-nyusu'
 */
export async function generateSlug(db: D1Database, title: string): Promise<string> {
  // 1. Convert Japanese to romaji
  const romanized = toRomaji(title);

  // 2. Lowercase
  const lowercased = romanized.toLowerCase();

  // 3. Remove special characters (keep alphanumeric and spaces)
  const cleaned = lowercased.replace(/[^a-z0-9\s]/g, '');

  // 4. Replace spaces with hyphens, remove consecutive hyphens
  const hyphenated = cleaned
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // 5. Truncate to 80 characters
  const truncated = hyphenated.slice(0, 80).replace(/-$/, '');

  // 6. Ensure uniqueness
  return ensureUniqueSlug(truncated, db);
}

/**
 * Extract excerpt from email content (plain text or HTML).
 *
 * Steps:
 * 1. Strip HTML tags if present
 * 2. Normalize whitespace
 * 3. Truncate to maxLength characters
 * 4. Add ellipsis if truncated
 *
 * @param content - Email content (HTML or plain text)
 * @param maxLength - Maximum excerpt length (default: 200)
 * @returns Excerpt text
 *
 * @example
 * generateExcerpt('<p>Hello World</p>', 50)
 * // => 'Hello World'
 *
 * @example
 * generateExcerpt('A'.repeat(300), 200)
 * // => 'A'.repeat(197) + '...'
 */
export function generateExcerpt(content: string, maxLength: number = 200): string {
  // 1. Strip HTML tags (simple regex - may not handle all edge cases)
  const stripped = content.replace(/<[^>]*>/g, '');

  // 2. Normalize whitespace
  const normalized = stripped.replace(/\s+/g, ' ').trim();

  // 3. Truncate to maxLength
  if (normalized.length <= maxLength) {
    return normalized;
  }

  // 4. Add ellipsis
  return normalized.slice(0, maxLength - 3) + '...';
}

/**
 * Ensure slug is unique by checking database and appending numeric suffix if needed.
 *
 * If slug exists, try slug-2, slug-3, etc. until a unique one is found.
 *
 * @param baseSlug - Initial slug to check
 * @param db - D1 database instance
 * @returns Unique slug
 *
 * @example
 * // If 'hello-world' exists in DB
 * await ensureUniqueSlug('hello-world', db)
 * // => 'hello-world-2'
 */
export async function ensureUniqueSlug(baseSlug: string, db: D1Database): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;

  // Check if slug exists in campaigns table
  while (true) {
    const existing = await db
      .prepare('SELECT slug FROM campaigns WHERE slug = ?')
      .bind(slug)
      .first();

    if (!existing) {
      return slug;
    }

    // Try next suffix
    slug = `${baseSlug}-${suffix}`;
    suffix++;

    // Safety: prevent infinite loop
    if (suffix > 100) {
      throw new Error('Failed to generate unique slug after 100 attempts');
    }
  }
}
