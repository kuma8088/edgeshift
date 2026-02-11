'use client';

import { useState } from 'react';
import type { PublishedCourse } from '../../utils/shop-api';

interface Props {
  course: PublishedCourse;
  currentLectureId?: string;
}

function getLectureIcon(type: string): string {
  switch (type) {
    case 'video':
      return '\uD83C\uDFAC';
    case 'quiz':
      return '\u2753';
    case 'text':
    default:
      return '\uD83D\uDCDD';
  }
}

export function CourseSidebar({ course, currentLectureId }: Props) {
  // Expand the section that contains the current lecture by default
  const initialExpanded = new Set<string>();
  if (currentLectureId && course.sections) {
    for (const section of course.sections) {
      if (section.lectures?.some((l) => l.id === currentLectureId)) {
        initialExpanded.add(section.id);
      }
    }
  }
  // If no section is expanded, expand the first one
  if (initialExpanded.size === 0 && course.sections && course.sections.length > 0) {
    initialExpanded.add(course.sections[0].id);
  }

  const [expandedSections, setExpandedSections] = useState<Set<string>>(initialExpanded);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  return (
    <div className="w-full">
      {/* Course title */}
      <div className="px-4 py-3 border-b border-gray-200">
        <a
          href={`/learn/${course.slug}`}
          className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-2"
        >
          {course.title}
        </a>
      </div>

      {/* Sections */}
      <nav className="py-2">
        {course.sections?.map((section) => {
          const isExpanded = expandedSections.has(section.id);

          return (
            <div key={section.id}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium text-gray-700 line-clamp-1 flex-1">
                  {section.title}
                </span>
                <svg
                  className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Lectures */}
              {isExpanded && section.lectures && (
                <div className="pb-1">
                  {section.lectures.map((lecture) => {
                    const isCurrent = lecture.id === currentLectureId;

                    return (
                      <a
                        key={lecture.id}
                        href={`/learn/${course.slug}/lectures/${lecture.id}`}
                        className={`block pl-8 pr-4 py-2 text-sm transition-colors ${
                          isCurrent
                            ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs flex-shrink-0">
                            {getLectureIcon(lecture.type)}
                          </span>
                          <span className="line-clamp-1 flex-1">{lecture.title}</span>
                          {lecture.duration_minutes && (
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {lecture.duration_minutes}分
                            </span>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
