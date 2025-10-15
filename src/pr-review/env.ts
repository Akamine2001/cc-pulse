import { z } from 'zod';

/**
 * 環境変数のスキーマ定義
 */
const EnvSchema = z.object({
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1, 'CLAUDE_CODE_OAUTH_TOKEN is required'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  PR_NUMBER: z.string().regex(/^\d+$/, 'PR_NUMBER must be a number'),
  GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/, 'GITHUB_REPOSITORY must be in owner/repo format'),
  PR_AUTHOR: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * 環境変数を検証して取得
 */
export function validateEnv(): Env {
  try {
    return EnvSchema.parse({
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      PR_NUMBER: process.env.PR_NUMBER,
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
      PR_AUTHOR: process.env.PR_AUTHOR
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment variable validation failed:');
      for (const issue of error.errors) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    throw new Error('Invalid environment variables');
  }
}
