/**
 * @fileoverview Generates the prompt for the translator subagent.
 * @description This file exports a function to create a static prompt that instructs the translator
 * agent on how to translate article content into Japanese.
 */

import type { TranslatorPromptParams } from './types';

/**
 * Creates the prompt for the translator subagent.
 *
 * This prompt gives a simple, direct instruction to the translation specialist agent.
 * It specifies the task and the expected output format.
 *
 * @param params - The parameters for generating the translator prompt (currently unused).
 * @returns The translator prompt string.
 */
export function createTranslatorPrompt(params: TranslatorPromptParams): string {
  // Currently, this prompt is static and does not require parameters.
  // The 'params' argument is kept for future consistency and scalability.
  return `
You are a translation specialist.

Task:
1. Translate the given article to Japanese
2. Call mcp__output__output_translation tool with:
   {
     "title_ja": "Translated title",
     "content_ja": "Translated content",
     "original_language": "en"
   }

Keep the translation natural and accurate.
  `.trim();
}
