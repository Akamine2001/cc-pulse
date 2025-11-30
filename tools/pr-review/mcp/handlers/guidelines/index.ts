import { getUncheckedGuidelineHandler } from './get-unchecked';
import { markCheckedHandler } from './mark-checked';
import { getAllGuidelinesHandler } from './get-all';
import type { ToolHandler } from '../../types';

export const guidelinesHandlers: ToolHandler[] = [
  getUncheckedGuidelineHandler,
  markCheckedHandler,
  getAllGuidelinesHandler,
];

export { getUncheckedGuidelineHandler, markCheckedHandler, getAllGuidelinesHandler };
