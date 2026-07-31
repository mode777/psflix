import { pb } from './pb';

type FileRecord = { collectionId: string; id: string };

export function fileUrl(record: FileRecord, filename: string): string {
  return pb.files.getURL(record, filename);
}
