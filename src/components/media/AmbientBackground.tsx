import { fileUrl } from '@/lib/pb-files';

export type AmbientCover = {
  id: string;
  collectionId: string;
  cover_image?: string;
};

export function AmbientBackground({ cover }: { cover: AmbientCover | null }) {
  const url = cover?.cover_image ? fileUrl(cover, cover.cover_image) : null;

  if (!url) {
    return <div className="bg-ambient" />;
  }

  return (
    <div className="bg-ambient" style={{ backgroundImage: `url('${url}')` }} aria-hidden="true" />
  );
}
