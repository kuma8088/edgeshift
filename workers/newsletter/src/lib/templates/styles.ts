/**
 * Common email styles optimized for Japanese typography
 *
 * Design reference: Udemy promotional emails
 * - Gray background + white content box
 * - Proper padding/margin for readability
 * - Appropriate line-height (not too wide)
 */

/**
 * Font stack optimized for Japanese + cross-platform
 * Priority: Apple (Mac/iOS) -> Windows -> fallback
 */
export const FONT_FAMILY = [
  '-apple-system',
  'BlinkMacSystemFont',
  "'Hiragino Kaku Gothic ProN'",
  "'Hiragino Sans'",
  'Meiryo',
  "'Segoe UI'",
  'sans-serif',
].join(', ');

/**
 * Color palette
 */
export const COLORS = {
  background: '#f5f5f5',
  contentBox: '#ffffff',
  text: {
    primary: '#1e1e1e',
    secondary: '#525252',
    muted: '#a3a3a3',
  },
  accent: '#7c3aed',
  border: '#e5e5e5',
} as const;

/**
 * Spacing constants
 */
export const SPACING = {
  containerPadding: '40px 20px',
  boxPadding: '24px',
  boxPaddingMobile: '24px',
  sectionGap: '24px',
  paragraphGap: '12px',
  listItemGap: '4px',
} as const;

/**
 * Typography settings
 */
export const TYPOGRAPHY = {
  body: {
    fontSize: '16px',
    lineHeight: '1.5',
    letterSpacing: '0.02em',
  },
  heading: {
    fontSize: '24px',
    lineHeight: '1.4',
    letterSpacing: '0.01em',
  },
  small: {
    fontSize: '14px',
    lineHeight: '1.5',
  },
  footer: {
    fontSize: '12px',
    lineHeight: '1.5',
  },
} as const;

/**
 * Pre-built inline style strings for common elements
 */
export const STYLES = {
  /** Outer wrapper with gray background */
  wrapper: `background-color: ${COLORS.background}; padding: ${SPACING.containerPadding};`,

  /** White content box */
  contentBox: `background-color: ${COLORS.contentBox}; max-width: 540px; margin: 0 auto; padding: ${SPACING.boxPadding}; border-radius: 8px;`,

  /** Body element style (for non-box layout fallback) */
  body: (textColor: string) =>
    `font-family: ${FONT_FAMILY}; font-size: ${TYPOGRAPHY.body.fontSize}; line-height: ${TYPOGRAPHY.body.lineHeight}; letter-spacing: ${TYPOGRAPHY.body.letterSpacing}; color: ${textColor}; max-width: 600px; margin: 0 auto; padding: 20px;`,

  /** Base text style (applied to content box) */
  baseText: (textColor: string) =>
    `font-family: ${FONT_FAMILY}; font-size: ${TYPOGRAPHY.body.fontSize}; line-height: ${TYPOGRAPHY.body.lineHeight}; letter-spacing: ${TYPOGRAPHY.body.letterSpacing}; color: ${textColor};`,

  /** Main heading (h1) style */
  heading: (textColor: string) =>
    `font-size: ${TYPOGRAPHY.heading.fontSize}; line-height: ${TYPOGRAPHY.heading.lineHeight}; letter-spacing: ${TYPOGRAPHY.heading.letterSpacing}; color: ${textColor}; margin: 0 0 ${SPACING.paragraphGap} 0;`,

  /** Large heading for announcements */
  headingLarge: (textColor: string) =>
    `font-size: 28px; line-height: ${TYPOGRAPHY.heading.lineHeight}; color: ${textColor}; margin: 0;`,

  /** Subheading style */
  subheading: (textColor: string) =>
    `font-size: 18px; line-height: 1.5; color: ${textColor}; margin: 0 0 ${SPACING.paragraphGap} 0;`,

  /** Paragraph style */
  paragraph: `margin: 0 0 ${SPACING.paragraphGap} 0;`,

  /** Footer wrapper */
  footerWrapper: `margin-top: ${SPACING.sectionGap}; padding-top: ${SPACING.sectionGap}; border-top: 1px solid ${COLORS.border};`,

  /** Footer text style */
  footer: `color: ${COLORS.text.muted}; font-size: ${TYPOGRAPHY.footer.fontSize}; line-height: ${TYPOGRAPHY.footer.lineHeight}; text-align: center;`,

  /** Small/secondary text style */
  small: (textColor: string) =>
    `color: ${textColor}; font-size: ${TYPOGRAPHY.small.fontSize}; line-height: ${TYPOGRAPHY.small.lineHeight};`,

  /** Horizontal rule */
  hr: `border: none; border-top: 1px solid ${COLORS.border}; margin: ${SPACING.sectionGap} 0;`,

  /** Content wrapper */
  content: `margin-bottom: ${SPACING.sectionGap};`,

  /** Email signature (between content and footer) */
  signature: `margin: ${SPACING.sectionGap} 0; padding-top: ${SPACING.sectionGap}; border-top: 1px solid ${COLORS.border}; font-size: ${TYPOGRAPHY.small.fontSize}; color: ${COLORS.text.secondary}; line-height: 1.6;`,

  /** List styles (ol/ul) */
  list: `margin: 0 0 ${SPACING.paragraphGap} 0; padding-left: 16px;`,

  /** List item style */
  listItem: `margin-bottom: ${SPACING.listItemGap};`,

  /** Badge/label style */
  badge: (bgColor: string) =>
    `background-color: ${bgColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;`,

  /** CTA Button style */
  button: (bgColor: string) =>
    `display: inline-block; background-color: ${bgColor}; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 500;`,

  /** Link style */
  link: (color: string) => `color: ${color}; text-decoration: none;`,

  /** Image style (for YouTube thumbnails, etc.) */
  image: 'display: block; max-width: 100%; height: auto; border-radius: 8px;',

  /** Image link wrapper */
  imageLink: `display: block; margin: ${SPACING.sectionGap} 0;`,

  /** YouTube thumbnail wrapper - simple clickable image (email-compatible) */
  youtubeThumbnail: 'display: block; max-width: 100%; height: auto; border-radius: 8px;',

  /** YouTube link wrapper */
  youtubeLink: `display: block; margin: ${SPACING.sectionGap} 0; text-decoration: none;`,
} as const;

/**
 * Apply inline styles to list elements (ul, ol, li)
 * Email clients don't support <style> tags, so inline styles are required
 */
export function applyListStyles(html: string): string {
  return html
    // Apply list (ul/ol) styles
    .replace(/<(ul|ol)(?![^>]*style=)/gi, `<$1 style="${STYLES.list}"`)
    // Apply list item styles
    .replace(/<li(?![^>]*style=)/gi, `<li style="${STYLES.listItem}"`)
    // Reset margin on <p> tags inside <li> (TipTap wraps list content in <p>)
    // Email clients apply default margin to <p> which causes extra spacing
    .replace(/(<li[^>]*>)(\s*)(<p)(?![^>]*style=)/gi, '$1$2$3 style="margin:0"');
}

/**
 * Generate full email HTML structure with gray background + white box
 */
export function wrapInEmailLayout(content: string, textColor: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; ${STYLES.wrapper}">
  <div style="${STYLES.contentBox} ${STYLES.baseText(textColor)}">
    ${content}
  </div>
</body>
</html>
  `.trim();
}
