/**
 * Content processing utilities for email content
 *
 * This module handles:
 * - YouTube URL detection and thumbnail conversion
 * - Plain text URL to clickable link conversion
 */

import { STYLES, COLORS } from './templates/styles';

/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
export function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Check if a URL is a YouTube URL
 */
export function isYoutubeUrl(url: string): boolean {
  return extractYoutubeVideoId(url) !== null;
}

/**
 * Convert YouTube URL to clickable thumbnail HTML
 * Uses maxresdefault.jpg for best quality
 * Falls back to hqdefault.jpg if maxres not available (handled by YouTube CDN)
 */
export function youtubeUrlToThumbnail(url: string): string {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    console.log(`YouTube thumbnail skipped: could not extract video ID from "${url}"`);
    return url;
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return `<a href="${videoUrl}" style="${STYLES.youtubeLink}" target="_blank">
    <img src="${thumbnailUrl}" alt="YouTube video thumbnail" style="${STYLES.youtubeThumbnail}" />
  </a>`;
}

/**
 * Convert anchor tags with YouTube URLs to clickable thumbnails
 * Handles format: <a href="YOUTUBE_URL">...</a>
 */
export function convertYoutubeAnchors(html: string): string {
  // Match <a> tags where href is a YouTube URL
  const anchorRegex = /<a\s+[^>]*href=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^"']+)["'][^>]*>[^<]*<\/a>/gi;

  return html.replace(anchorRegex, (match, url) => {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) return match;

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return `<a href="${videoUrl}" style="${STYLES.youtubeLink}" target="_blank">
      <img src="${thumbnailUrl}" alt="YouTube video thumbnail" style="${STYLES.youtubeThumbnail}" />
    </a>`;
  });
}

/**
 * Convert YouTube URLs in text to clickable thumbnails
 * Processes standalone YouTube URLs (on their own line or surrounded by whitespace)
 */
export function convertYoutubeUrls(text: string): string {
  // Match YouTube URLs that are not already inside HTML tags
  // Captures URLs on their own line or surrounded by whitespace
  const youtubeUrlRegex = /(?<!href="|src="|<a [^>]*>)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[^\s<>"。、！？]+)(?![^<]*<\/a>)/g;

  return text.replace(youtubeUrlRegex, (match) => {
    return youtubeUrlToThumbnail(match);
  });
}

/**
 * Convert plain text URLs to clickable links
 * Matches URLs starting with http:// or https://
 * Uses negative lookbehind to avoid matching URLs already inside HTML attributes
 * Note: YouTube URLs are handled separately by convertYoutubeUrls
 */
export function linkifyUrls(text: string): string {
  // First, convert YouTube anchor tags to thumbnails
  let result = convertYoutubeAnchors(text);

  // Then, convert standalone YouTube URLs to thumbnails
  result = convertYoutubeUrls(result);

  // Then linkify remaining URLs (excluding YouTube URLs that weren't converted and existing links)
  // Negative lookbehind (?<!...) to skip URLs inside HTML attributes like href="..." or src="..."
  // Also skip URLs that are already inside <a> tags
  const urlRegex = /(?<!href="|src="|<a [^>]*>)(https?:\/\/[^\s<>"。、！？]+)(?![^<]*<\/a>)/g;
  return result.replace(urlRegex, (match) => {
    // Skip if it's a YouTube URL (already handled) or YouTube thumbnail URL
    if (isYoutubeUrl(match) || match.includes('img.youtube.com')) {
      return match;
    }
    return `<a href="${match}" style="${STYLES.link(COLORS.accent)}">${match}</a>`;
  });
}
