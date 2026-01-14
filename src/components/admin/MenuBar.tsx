import type { Editor } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import { YouTubeInsertModal } from './YouTubeInsertModal';

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
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    const url = window.prompt('Enter image URL:');
    if (url) {
      // Insert image as HTML img tag
      const imgHtml = `<img src="${url}" alt="Image" style="max-width: 100%; height: auto;" />`;
      editor.chain().focus().insertContent(imgHtml).run();
    }
  };

  const handleInsertYouTube = (url: string) => {
    // Insert YouTube URL as a clickable link with thumbnail preview text
    // The actual conversion to thumbnail happens on email send
    const youtubeHtml = `<p><a href="${url}" target="_blank">[YouTube Video: ${url}]</a></p>`;
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
      <button
        onClick={handleInsertImage}
        className={buttonClass(false)}
        type="button"
        title="Insert Image"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
        Image
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
        >
          {'{{}}'}
        </button>
        {isVariableDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
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
