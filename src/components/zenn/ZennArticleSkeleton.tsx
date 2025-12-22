/**
 * Skeleton loading component for Zenn article card
 * Matches the OG image + time layout
 */
export function ZennArticleSkeleton() {
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-[#e5e5e5] animate-pulse">
      {/* OG Image placeholder */}
      <div className="aspect-[1200/630] bg-[#e5e5e5]" />

      {/* Time placeholder */}
      <div className="px-4 py-3">
        <div className="h-4 bg-[#e5e5e5] rounded w-16" />
      </div>
    </div>
  );
}
