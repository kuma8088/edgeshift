'use client';

import type { PublishedCourse } from '../../utils/shop-api';

interface Props {
  course: PublishedCourse;
}

export function CourseCard({ course }: Props) {
  const sectionCount = course.sections?.length ?? 0;
  const lectureCount =
    course.sections?.reduce((sum, s) => sum + (s.lectures?.length ?? 0), 0) ?? 0;

  return (
    <a
      href={`/learn/${course.slug}`}
      className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden"
    >
      {/* Thumbnail */}
      {course.thumbnail_url ? (
        <img
          src={course.thumbnail_url}
          alt={course.title}
          className="w-full h-44 object-cover"
        />
      ) : (
        <div className="w-full h-44 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <span className="text-white text-4xl font-bold opacity-50">
            {course.title.charAt(0)}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {course.title}
        </h3>

        {course.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {course.description}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {sectionCount > 0 && (
            <span>{sectionCount} セクション</span>
          )}
          {lectureCount > 0 && (
            <span>{lectureCount} レクチャー</span>
          )}
        </div>
      </div>
    </a>
  );
}
