/**
 * Feature Reviewer固有の型定義
 */

/**
 * 環境変数
 */
export interface FeatureReviewerEnv {
  CLAUDE_CODE_OAUTH_TOKEN: string;
  GITHUB_TOKEN: string;
  ISSUE_NUMBER: string;
  GITHUB_REPOSITORY: string;
}

/**
 * GitHubリポジトリ情報
 */
export interface RepositoryInfo {
  owner: string;
  repo: string;
}
