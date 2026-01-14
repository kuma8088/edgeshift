import type { Editor } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import { YouTubeInsertModal } from './YouTubeInsertModal';
import { uploadImage } from '../../utils/admin-api';

interface MenuBarProps {
  editor: Editor | null;
}

interface VariableOption {
  label: string;
  value: string;
  description: string;
}

const AVAILABLE_VARIABLES: VariableOption[] = [
  { label: '{{name}}', value: '{{name}}', description: '購読者名' },
  { label: '{{unsubscribe_url}}', value: '{{unsubscribe_url}}', description: '配信停止リンク' },
];

export function MenuBar({ editor }: MenuBarProps) {
  const [isVariableDropdownOpen, setIsVariableDropdownOpen] = useState(false);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsVariableDropdownOpen(false);
      }
    }

    if (isVariableDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVariableDropdownOpen]);

  if (!editor) {
    return null;
  }

  const insertVariable = (variable: string) => {
    editor.chain().focus().insertContent(variable).run();
    setIsVariableDropdownOpen(false);
  };

  const handleInsertImage = () => {
    // Trigger file input click
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value to allow selecting the same file again
    event.target.value = '';

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('対応している画像形式: JPG, PNG, GIF, WebP');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('ファイルサイズは5MB以下にしてください');
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadImage(file);
      if (!result.success || !result.data) {
        alert(`アップロードに失敗しました: ${result.error || '不明なエラー'}`);
        return;
      }

      // Insert image into editor
      const imgHtml = `<img src="${result.data.url}" alt="Image" style="max-width: 100%; height: auto;" />`;
      editor?.chain().focus().insertContent(imgHtml).run();
    } catch (error) {
      console.error('Image upload error:', error);
      alert('画像のアップロード中にエラーが発生しました');
    } finally {
      setIsUploading(false);
    }
  };

  const handleInsertYouTube = (url: string) => {
    // Extract video ID for safety (defense in depth)
    const patterns = [
      /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];

    let videoId: string | null = null;
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        videoId = match[1];
        break;
      }
    }

    if (!videoId) {
      console.error('Invalid YouTube URL passed to handleInsertYouTube');
      return;
    }

    // Use canonical URL format (safe)
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const youtubeHtml = `<p><a href="${canonicalUrl}" target="_blank">[YouTube Video]</a></p>`;
    editor.chain().focus().insertContent(youtubeHtml).run();
  };

  const buttonClass = (isActive: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded ${
      isActive
        ? 'bg-gray-800 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={buttonClass(editor.isActive('bold'))}
        type="button"
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={buttonClass(editor.isActive('italic'))}
        type="button"
      >
        Italic
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={buttonClass(editor.isActive('strike'))}
        type="button"
      >
        Strike
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 1 }))}
        type="button"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 2 }))}
        type="button"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 3 }))}
        type="button"
      >
        H3
      </button>
      <button
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={buttonClass(editor.isActive('paragraph'))}
        type="button"
      >
        P
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(editor.isActive('bulletList'))}
        type="button"
      >
        Bullet List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={buttonClass(editor.isActive('orderedList'))}
        type="button"
      >
        Ordered List
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => {
          const url = window.prompt('Enter URL:');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        className={buttonClass(editor.isActive('link'))}
        type="button"
      >
        Link
      </button>
      <button
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive('link')}
        className="px-3 py-1.5 text-sm font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
      >
        Unlink
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={handleInsertImage}
        className={`${buttonClass(false)} ${isUploading ? 'opacity-50 cursor-wait' : ''}`}
        type="button"
        title="Insert Image"
        disabled={isUploading}
      >
        {isUploading ? (
          <svg className="animate-spin h-4 w-4 inline-block mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
        )}
        {isUploading ? 'Uploading...' : 'Image'}
      </button>
      <button
        onClick={() => setShowYouTubeModal(true)}
        className={buttonClass(false)}
        type="button"
        title="Insert YouTube Video"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
        </svg>
        YouTube
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsVariableDropdownOpen(!isVariableDropdownOpen)}
          className={buttonClass(isVariableDropdownOpen)}
          type="button"
          title="変数を挿入"
          aria-haspopup="listbox"
          aria-expanded={isVariableDropdownOpen}
        >
          {'{{}}'}
        </button>
        {isVariableDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
            role="listbox"
            aria-label="変数一覧"
          >
            <div className="p-2">
              <p className="text-xs font-medium text-gray-500 mb-2 px-2">変数を挿入</p>
              {AVAILABLE_VARIABLES.map((variable) => (
                <button
                  key={variable.value}
                  onClick={() => insertVariable(variable.value)}
                  className="w-full text-left px-2 py-2 text-sm rounded hover:bg-gray-100 transition-colors"
                  type="button"
                >
                  <span className="font-mono text-blue-600">{variable.label}</span>
                  <span className="text-gray-500 ml-2">- {variable.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <YouTubeInsertModal
        isOpen={showYouTubeModal}
        onClose={() => setShowYouTubeModal(false)}
        onInsert={handleInsertYouTube}
      />
    </div>
  );
}
