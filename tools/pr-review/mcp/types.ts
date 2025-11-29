export interface ReviewContextConfig {
  prNumber: number;
  prAuthor: string;
  headSha: string;
  owner: string;
  repo: string;
  guidelinesFilePath: string;
  existingCommentsPath: string;
  isLocalMode: boolean;
  julesSessionFound: boolean;
}
