import { designFp } from '../fingerprints';
import { projectStructures } from '../structure';
import { memoByKey } from './memo';

/** projectStructures, memoised on the design fingerprint (it carries racking,
 *  roofs, panel id, structure defaults and overrides). */
export const deriveStructures = memoByKey(designFp, projectStructures);
