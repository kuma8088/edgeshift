/**
 * Common email styles optimized for Japanese typography
 *
 * Best practices for Japanese email:
 * - Include Japanese fonts in font-family stack
 * - Use larger line-height (1.7-1.8) for readability
 * - Add slight letter-spacing for dense Japanese text
 * - Minimum font-size 16px for body text (mobile readability)
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
 * Typography settings
 */
export const TYPOGRAPHY = {
  body: {
    fontSize: '16px',
    lineHeight: '1.8',
    letterSpacing: '0.02em',
  },
  heading: {
    fontSize: '24px',
    lineHeight: '1.4',
    letterSpacing: '0.01em',
  },
  small: {
    fontSize: '14px',
    lineHeight: '1.6',
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
  /** Body element style */
  body: (textColor: string) =>
    `font-family: ${FONT_FAMILY}; font-size: ${TYPOGRAPHY.body.fontSize}; line-height: ${TYPOGRAPHY.body.lineHeight}; letter-spacing: ${TYPOGRAPHY.body.letterSpacing}; color: ${textColor}; max-width: 600px; margin: 0 auto; padding: 20px;`,

  /** Main heading (h1) style */
  heading: (textColor: string) =>
    `font-size: ${TYPOGRAPHY.heading.fontSize}; line-height: ${TYPOGRAPHY.heading.lineHeight}; letter-spacing: ${TYPOGRAPHY.heading.letterSpacing}; color: ${textColor}; margin: 0;`,

  /** Large heading for announcements */
  headingLarge: (textColor: string) =>
    `font-size: 28px; line-height: ${TYPOGRAPHY.heading.lineHeight}; color: ${textColor}; margin: 0;`,

  /** Subheading style */
  subheading: (textColor: string) =>
    `font-size: 18px; line-height: 1.5; color: ${textColor};`,

  /** Footer text style */
  footer: `color: #a3a3a3; font-size: ${TYPOGRAPHY.footer.fontSize}; line-height: ${TYPOGRAPHY.footer.lineHeight}; text-align: center;`,

  /** Small/secondary text style */
  small: (textColor: string) =>
    `color: ${textColor}; font-size: ${TYPOGRAPHY.small.fontSize}; line-height: ${TYPOGRAPHY.small.lineHeight};`,

  /** Horizontal rule */
  hr: 'border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;',

  /** Content wrapper */
  content: 'margin-bottom: 32px;',

  /** Badge/label style */
  badge: (bgColor: string) =>
    `background-color: ${bgColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;`,
} as const;
