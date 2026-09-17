import PocketBase from 'pocketbase';

import { resolvePbUrl } from './pb-url';

const url = resolvePbUrl();

export const pb = new PocketBase(url);

pb.autoCancellation(false);
