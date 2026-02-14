'use client';

import { useState, useEffect } from 'react';
import {
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listLectures,
  deleteLecture,
  type CourseSection,
  type CourseLecture,
  type CreateSectionData,
} from '../../utils/admin-api';
import { ConfirmModal } from './ConfirmModal';

const lectureTypeLabels: Record<string, string> = {
  text: 'テキスト',
  video: '動画',
  quiz: 'クイズ',
};

interface SectionListProps {
  courseId?: string;
}

export default function SectionList({ courseId: propCourseId }: SectionListProps) {
  const [courseId, setCourseId] = useState<string | null>(propCourseId || null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [lecturesBySection, setLecturesBySection] = useState<Record<string, CourseLecture[]>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline add section form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionDescription, setNewSectionDescription] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Inline edit section
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'section' | 'lecture';
    id: string;
    name: string;
  }>({
    isOpen: false,
    type: 'section',
    id: '',
    name: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (propCourseId) {
      setCourseId(propCourseId);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      setError('Course ID is required');
      setLoading(false);
      return;
    }
    setCourseId(id);
  }, [propCourseId]);

  useEffect(() => {
    if (courseId) {
      fetchSections();
    }
  }, [courseId]);

  const fetchSections = async () => {
    if (!courseId) return;
    setLoading(true);
    const result = await listSections(courseId);
    if (result.success && result.data) {
      setSections(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load sections');
    }
    setLoading(false);
  };

  const fetchLectures = async (sectionId: string) => {
    const result = await listLectures(sectionId);
    if (result.success && result.data) {
      setLecturesBySection((prev) => ({ ...prev, [sectionId]: result.data! }));
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
        // Fetch lectures when expanding for the first time
        if (!lecturesBySection[sectionId]) {
          fetchLectures(sectionId);
        }
      }
      return next;
    });
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !newSectionTitle.trim()) return;

    setAddLoading(true);
    const data: CreateSectionData = {
      title: newSectionTitle.trim(),
      description: newSectionDescription.trim() || undefined,
    };

    const result = await createSection(courseId, data);
    if (result.success) {
      setNewSectionTitle('');
      setNewSectionDescription('');
      setShowAddForm(false);
      await fetchSections();
    } else {
      setError(result.error || 'Failed to create section');
    }
    setAddLoading(false);
  };

  const startEditSection = (section: CourseSection) => {
    setEditingSectionId(section.id);
    setEditTitle(section.title);
    setEditDescription(section.description || '');
  };

  const handleEditSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSectionId || !editTitle.trim()) return;

    setEditLoading(true);
    const result = await updateSection(editingSectionId, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
    });

    if (result.success) {
      setEditingSectionId(null);
      await fetchSections();
    } else {
      setError(result.error || 'Failed to update section');
    }
    setEditLoading(false);
  };

  const handleDeleteConfirm = (type: 'section' | 'lecture', id: string, name: string) => {
    setConfirmModal({ isOpen: true, type, id, name });
  };

  const confirmDeleteAction = async () => {
    setActionLoading(true);
    const { type, id } = confirmModal;

    try {
      const result = type === 'section' ? await deleteSection(id) : await deleteLecture(id);

      if (result.success) {
        setConfirmModal({ isOpen: false, type: 'section', id: '', name: '' });
        if (type === 'section') {
          await fetchSections();
          // Clean up lectures cache
          setLecturesBySection((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        } else {
          // Refresh lectures for the affected section
          for (const [sectionId, lectures] of Object.entries(lecturesBySection)) {
            if (lectures.some((l) => l.id === id)) {
              await fetchLectures(sectionId);
              break;
            }
          }
          await fetchSections(); // Update lecture counts
        }
      } else {
        setError(result.error || 'Delete failed');
      }
    } catch (err) {
      setError('Unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelDelete = () => {
    setConfirmModal({ isOpen: false, type: 'section', id: '', name: '' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-24" />
        ))}
      </div>
    );
  }

  if (error && sections.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchSections}
          className="px-6 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section, index) => (
          <div
            key={section.id}
            className="bg-white rounded-lg shadow-sm border border-[var(--color-border)]"
          >
            {/* Section Header */}
            {editingSectionId === section.id ? (
              <form onSubmit={handleEditSection} className="p-4 space-y-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  placeholder="セクションタイトル"
                />
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  placeholder="説明（オプション）"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="px-4 py-1 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                  >
                    {editLoading ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSectionId(null)}
                    className="px-4 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            ) : (
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[var(--color-text-muted)] text-sm font-mono">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`transform transition-transform ${
                      expandedSections.has(section.id) ? 'rotate-90' : ''
                    }`}
                  >
                    ▶
                  </span>
                  <div>
                    <h3 className="font-medium text-[var(--color-text)]">{section.title}</h3>
                    {section.description && (
                      <p className="text-sm text-[var(--color-text-secondary)]">{section.description}</p>
                    )}
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {section.lecture_count} レクチャー
                    </span>
                  </div>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => startEditSection(section)}
                    className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteConfirm('section', section.id, section.title)}
                    className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            )}

            {/* Lectures (expanded) */}
            {expandedSections.has(section.id) && (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                {lecturesBySection[section.id] ? (
                  <>
                    {lecturesBySection[section.id].length === 0 ? (
                      <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
                        レクチャーがありません
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--color-border)]">
                        {lecturesBySection[section.id].map((lecture, lectureIndex) => (
                          <div
                            key={lecture.id}
                            className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[var(--color-text-muted)] text-xs font-mono">
                                {String(lectureIndex + 1).padStart(2, '0')}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-[var(--color-text)]">{lecture.title}</span>
                                  <span className="px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700">
                                    {lectureTypeLabels[lecture.type] || lecture.type}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 text-xs rounded-full ${
                                      lecture.is_published
                                        ? 'bg-green-500 text-white'
                                        : 'bg-[var(--color-text-muted)] text-white'
                                    }`}
                                  >
                                    {lecture.is_published ? '公開' : '非公開'}
                                  </span>
                                </div>
                                {lecture.duration_minutes && (
                                  <span className="text-xs text-[var(--color-text-muted)]">
                                    {lecture.duration_minutes}分
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <a
                                href={`/admin/courses/lectures/edit?id=${lecture.id}`}
                                className="px-3 py-1 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                              >
                                編集
                              </a>
                              <button
                                onClick={() => handleDeleteConfirm('lecture', lecture.id, lecture.title)}
                                className="px-3 py-1 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add Lecture button */}
                    <div className="p-3 border-t border-[var(--color-border)]">
                      <a
                        href={`/admin/courses/lectures/edit?sectionId=${section.id}`}
                        className="inline-block px-4 py-1.5 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
                      >
                        + レクチャーを追加
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="p-4">
                    <div className="animate-pulse space-y-2">
                      <div className="h-8 bg-gray-200 rounded" />
                      <div className="h-8 bg-gray-200 rounded" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add Section */}
        {showAddForm ? (
          <form
            onSubmit={handleAddSection}
            className="bg-white rounded-lg p-4 shadow-sm border border-[var(--color-border)] space-y-3"
          >
            <input
              type="text"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="セクションタイトル"
              autoFocus
            />
            <input
              type="text"
              value={newSectionDescription}
              onChange={(e) => setNewSectionDescription(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="説明（オプション）"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addLoading}
                className="px-4 py-1.5 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
              >
                {addLoading ? '追加中...' : 'セクションを追加'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewSectionTitle('');
                  setNewSectionDescription('');
                }}
                className="px-4 py-1.5 text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-3 border-2 border-dashed border-[var(--color-border)] rounded-lg text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            + セクションを追加
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'section' ? 'セクションを削除' : 'レクチャーを削除'}
        message={
          confirmModal.type === 'section'
            ? `「${confirmModal.name}」を削除してもよろしいですか？配下のレクチャーもすべて削除されます。この操作は取り消せません。`
            : `「${confirmModal.name}」を削除してもよろしいですか？この操作は取り消せません。`
        }
        confirmText="削除"
        cancelText="キャンセル"
        onConfirm={confirmDeleteAction}
        onCancel={cancelDelete}
        loading={actionLoading}
        danger
      />
    </>
  );
}
