import { z } from 'zod';

const commonEnvSchema = {
    GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
    GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/, 'GITHUB_REPOSITORY must be in owner/repo format'),
    JULES_API_KEY: z.string().optional(),
};

const prReviewEnvSchema = z.object({
    ...commonEnvSchema,
    CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1, 'CLAUDE_CODE_OAUTH_TOKEN is required'),
    PR_NUMBER: z.string().regex(/^\d+$/, 'PR_NUMBER must be a number'),
    PR_AUTHOR: z.string().optional(),
});

const julesSessionEnvSchema = z.object({
    ...commonEnvSchema,
    ISSUE_NUMBER: z.string().regex(/^\d+$/, 'ISSUE_NUMBER must be a number'),
    COMMENT_BODY: z.string().min(1, 'COMMENT_BODY is required'),
    COMMENT_USER: z.string().min(1, 'COMMENT_USER is required'),
});

export type PrReviewEnv = z.infer<typeof prReviewEnvSchema>;
export type JulesSessionEnv = z.infer<typeof julesSessionEnvSchema>;

function validate<T extends z.ZodType<any, any>>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
    try {
        return schema.parse(env);
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

export function validatePrReviewEnv(): PrReviewEnv {
    return validate(prReviewEnvSchema, process.env);
}

export function validateJulesSessionEnv(): JulesSessionEnv {
    return validate(julesSessionEnvSchema, process.env);
}
