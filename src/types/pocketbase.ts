/**
 * This file was @generated using pocketbase-typegen
 */

import type PocketBase from 'pocketbase';
import type { RecordService } from 'pocketbase';

export const Collections = {
  Consoles: 'consoles',
  Discs: 'discs',
  Documents: 'documents',
  Games: 'games',
  MemoryCards: 'memory_cards',
  SaveState: 'save_state',
  Users: 'users',
} as const;
export type Collections = (typeof Collections)[keyof typeof Collections];

// Alias types for improved usability
export type IsoDateString = string;
export type IsoAutoDateString = string & { readonly autodate: unique symbol };
export type RecordIdString = string;
export type FileNameString = string & { readonly filename: unique symbol };
export type HTMLString = string;

type ExpandType<T> = unknown extends T
  ? T extends unknown
    ? { expand?: unknown }
    : { expand: T }
  : { expand: T };

// System fields
export type BaseSystemFields<T = unknown> = {
  id: RecordIdString;
  collectionId: string;
  collectionName: Collections;
} & ExpandType<T>;

export type AuthSystemFields<T = unknown> = {
  email: string;
  emailVisibility: boolean;
  username: string;
  verified: boolean;
} & BaseSystemFields<T>;

// Record types for each collection

export const ConsolesRegionOptions = {
  'NTSC-U': 'NTSC-U',
  'NTSC-J': 'NTSC-J',
  PAL: 'PAL',
} as const;
export type ConsolesRegionOptions =
  (typeof ConsolesRegionOptions)[keyof typeof ConsolesRegionOptions];
export type ConsolesRecord = {
  bios: FileNameString;
  created: IsoAutoDateString;
  id: string;
  label?: string;
  region?: ConsolesRegionOptions;
  updated: IsoAutoDateString;
};

export type DiscsRecord = {
  created: IsoAutoDateString;
  game: RecordIdString;
  id: string;
  index?: number;
  iso?: FileNameString;
  serial: string;
  updated: IsoAutoDateString;
};

export const DocumentsTypeOptions = {
  manual: 'manual',
  guide: 'guide',
} as const;
export type DocumentsTypeOptions = (typeof DocumentsTypeOptions)[keyof typeof DocumentsTypeOptions];
export type DocumentsRecord = {
  created: IsoAutoDateString;
  file?: FileNameString;
  game?: RecordIdString;
  id: string;
  type?: DocumentsTypeOptions;
  updated: IsoAutoDateString;
};

export const GamesRegionOptions = {
  'NTSC-U': 'NTSC-U',
  'NTSC-J': 'NTSC-J',
  PAL: 'PAL',
} as const;
export type GamesRegionOptions = (typeof GamesRegionOptions)[keyof typeof GamesRegionOptions];
export type GamesRecord<Tfeatures = unknown, Tlanguages = unknown> = {
  cover_image?: FileNameString;
  created: IsoAutoDateString;
  description?: string;
  developer?: string;
  discs?: number;
  features?: null | Tfeatures;
  first_disc_serial: string;
  genre?: string;
  id: string;
  languages?: null | Tlanguages;
  manufacturer_description?: string;
  players?: string;
  publisher?: string;
  region?: GamesRegionOptions;
  release?: IsoDateString;
  screenshots?: FileNameString[];
  title: string;
  updated: IsoAutoDateString;
};

export const MemoryCardsMountedOptions = {
  slot1: 'slot1',
  slot2: 'slot2',
} as const;
export type MemoryCardsMountedOptions =
  (typeof MemoryCardsMountedOptions)[keyof typeof MemoryCardsMountedOptions];
export type MemoryCardsRecord = {
  created: IsoAutoDateString;
  data?: FileNameString;
  id: string;
  label?: string;
  // Mirrors pb_schema.json `memory_cards.mounted` select (`:894-908`).
  mounted?: MemoryCardsMountedOptions;
  updated: IsoAutoDateString;
  user?: RecordIdString;
};

export const SaveStateTypeOptions = {
  auto: 'auto',
  slot1: 'slot1',
  slot2: 'slot2',
  slot3: 'slot3',
} as const;
export type SaveStateTypeOptions = (typeof SaveStateTypeOptions)[keyof typeof SaveStateTypeOptions];
export type SaveStateRecord = {
  created: IsoAutoDateString;
  data: FileNameString;
  disc: RecordIdString;
  id: string;
  type: SaveStateTypeOptions;
  updated: IsoAutoDateString;
  user: RecordIdString;
};

export type UsersRecord = {
  avatar?: FileNameString;
  created: IsoAutoDateString;
  email: string;
  emailVisibility?: boolean;
  id: string;
  name?: string;
  password: string;
  tokenKey: string;
  updated: IsoAutoDateString;
  verified?: boolean;
};

// Response types include system fields and match responses from the PocketBase API
export type ConsolesResponse<Texpand = unknown> = Required<ConsolesRecord> &
  BaseSystemFields<Texpand>;
export type DiscsResponse<Texpand = unknown> = Required<DiscsRecord> & BaseSystemFields<Texpand>;
export type DocumentsResponse<Texpand = unknown> = Required<DocumentsRecord> &
  BaseSystemFields<Texpand>;
export type GamesResponse<Tfeatures = unknown, Tlanguages = unknown, Texpand = unknown> = Required<
  GamesRecord<Tfeatures, Tlanguages>
> &
  BaseSystemFields<Texpand>;
export type MemoryCardsResponse<Texpand = unknown> = Required<MemoryCardsRecord> &
  BaseSystemFields<Texpand>;
export type SaveStateResponse<Texpand = unknown> = Required<SaveStateRecord> &
  BaseSystemFields<Texpand>;
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>;

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
  consoles: ConsolesRecord;
  discs: DiscsRecord;
  documents: DocumentsRecord;
  games: GamesRecord;
  memory_cards: MemoryCardsRecord;
  save_state: SaveStateRecord;
  users: UsersRecord;
};

export type CollectionResponses = {
  consoles: ConsolesResponse;
  discs: DiscsResponse;
  documents: DocumentsResponse;
  games: GamesResponse;
  memory_cards: MemoryCardsResponse;
  save_state: SaveStateResponse;
  users: UsersResponse;
};

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<
  {
    // Omit AutoDate fields
    [
      K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never // Convert FileNameString to File
    ]: T[K] extends infer U
      ? U extends FileNameString | FileNameString[]
        ? U extends any[]
          ? File[]
          : File
        : U
      : never;
  },
  'id'
>;

// Create type for Auth collections
export type CreateAuth<T> = {
  id?: RecordIdString;
  email: string;
  emailVisibility?: boolean;
  password: string;
  passwordConfirm: string;
  verified?: boolean;
} & ProcessCreateAndUpdateFields<T>;

// Create type for Base collections
export type CreateBase<T> = {
  id?: RecordIdString;
} & ProcessCreateAndUpdateFields<T>;

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
  Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
  email?: string;
  emailVisibility?: boolean;
  oldPassword?: string;
  password?: string;
  passwordConfirm?: string;
  verified?: boolean;
};

// Update type for Base collections
export type UpdateBase<T> = Partial<Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>>;

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
  CollectionResponses[T] extends AuthSystemFields
    ? CreateAuth<CollectionRecords[T]>
    : CreateBase<CollectionRecords[T]>;

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
  CollectionResponses[T] extends AuthSystemFields
    ? UpdateAuth<CollectionRecords[T]>
    : UpdateBase<CollectionRecords[T]>;

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
  collection<T extends keyof CollectionResponses>(
    idOrName: T,
  ): RecordService<CollectionResponses[T]>;
} & PocketBase;
