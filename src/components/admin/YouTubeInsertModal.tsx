'use client';

import { useState, useEffect } from 'react';

interface YouTubeInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
}

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  return null;
}

/**
 * Validate if the URL is a YouTube URL
 */
function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Get YouTube thumbnail URL from video ID
 */
function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export function YouTubeInsertModal({ isOpen, onClose, onInsert }: YouTubeInsertModalProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setError('');
      setVideoId(null);
    }
  }, [isOpen]);

  // Update preview when URL changes
  useEffect(() => {
    if (url.trim()) {
      const id = extractYouTubeVideoId(url);
      if (id) {
        setVideoId(id);
        setError('');
      } else {
        setVideoId(null);
        setError('Invalid YouTube URL. Please use youtube.com/watch or youtu.be format.');
      }
    } else {
      setVideoId(null);
      setError('');
    }
  }, [url]);

  const handleInsert = () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      setError('Invalid YouTube URL. Please use youtube.com/watch or youtu.be format.');
      return;
    }

    onInsert(url.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInsert();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Insert YouTube Video
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-1">
              YouTube URL
            </label>
            <input
              type="text"
              id="youtube-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Thumbnail Preview */}
          {videoId && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <p className="text-xs text-gray-500 px-3 py-2 bg-gray-50">Preview:</p>
              <img
                src={getYouTubeThumbnailUrl(videoId)}
                alt="YouTube thumbnail preview"
                className="w-full h-auto"
                onError={(e) => {
                  // Fallback to default quality if maxresdefault doesn't exist
                  const img = e.target as HTMLImageElement;
                  if (img.src.includes('maxresdefault')) {
                    img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                  }
                }}
              />
            </div>
          )}

          <p className="text-xs text-gray-500">
            The video URL will be converted to a clickable thumbnail when the email is sent.
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!videoId}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
