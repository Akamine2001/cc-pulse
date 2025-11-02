/**
 * @fileoverview Defines types for prompt parameters.
 * @description This file contains type definitions for the parameters used in prompt generation functions,
 * ensuring type safety and clarity across the prompt management system.
 */

/**
 * Parameters for the master prompt.
 */
export interface MasterPromptParams {
  /** The keywords to search for news articles. */
  keywords: string[];
  /** The target number of articles to collect. */
  targetCount: number;
  /** Today's date in 'YYYY-MM-DD' format. */
  todayDate: string;
  /** The date one week ago in 'YYYY-MM-DD' format. */
  oneWeekAgoDate: string;
}

/**
 * Parameters for the news collector subagent prompt.
 */
export interface NewsCollectorPromptParams {
  /** Today's date in 'YYYY-MM-DD' format. */
  todayDate: string;
  /** The date one week ago in 'YYYY-MM-DD' format. */
  oneWeekAgoDate: string;
  /** The target number of unique articles to collect. */
  targetCount: number;
}

/**
 * Parameters for the translator subagent prompt.
 * @description Currently no dynamic parameters are needed, but the interface is defined for future scalability.
 */
export interface TranslatorPromptParams {}

/**
 * Parameters for the duplicate checker subagent prompt.
 * @description Currently no dynamic parameters are needed, but the interface is defined for future scalability.
 */
export interface DuplicateCheckerPromptParams {}

/**
 * Parameters for the aggregator subagent prompt.
 */
export interface AggregatorPromptParams {
  /** The keywords used for the news search. */
  keywords: string[];
  /** Today's date in 'YYYY-MM-DD' format. */
  todayDate: string;
}
