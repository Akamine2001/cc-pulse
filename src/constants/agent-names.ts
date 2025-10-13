/**
 * Agent names used in the CC Pulse system
 * These correspond to subagent types defined in query() options.agents
 */
export const AGENT_NAMES = {
  NEWS_COLLECTOR: 'news-collector',
  TRANSLATOR: 'translator',
  DUPLICATE_CHECKER: 'duplicate-checker',
  AGGREGATOR: 'aggregator',
} as const;

/**
 * Type for agent names
 */
export type AgentName = typeof AGENT_NAMES[keyof typeof AGENT_NAMES];

/**
 * Helper function to check if a string is a valid agent name
 */
export function isValidAgentName(name: string): name is AgentName {
  return Object.values(AGENT_NAMES).includes(name as AgentName);
}
