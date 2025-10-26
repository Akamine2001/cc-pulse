import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  GuidelinesOutput,
  ReviewChecklistItem,
  TestCase,
  FileReference,
  BusinessRule,
} from '../shared/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * チェックリスト項目 → Markdown
 */
function checklistItemToMarkdown(item: ReviewChecklistItem): string {
  const lines: string[] = [];
  lines.push(`- [ ] ${item.description}`);

  if (item.requirement) lines.push(`  - 要件: ${item.requirement}`);
  if (item.reference) lines.push(`  - 参考: ${item.reference}`);
  if (item.reason) lines.push(`  - 理由: ${item.reason}`);

  return lines.join('\n');
}

/**
 * テストケース → Markdown
 */
function testCaseToMarkdown(testCase: TestCase): string {
  const lines: string[] = [];
  lines.push(`- [ ] ${testCase.description}`);

  if (testCase.requirement) lines.push(`  - 要件: ${testCase.requirement}`);
  if (testCase.verification) lines.push(`  - 検証: ${testCase.verification}`);
  if (testCase.expected) lines.push(`  - 期待結果: ${testCase.expected}`);

  return lines.join('\n');
}

/**
 * ファイル参照 → Markdown
 */
function fileReferenceToMarkdown(ref: FileReference): string {
  const location = ref.line ? `${ref.file}:${ref.line}` : ref.file;
  return `- ${location} - ${ref.description}`;
}

/**
 * ビジネスルール → Markdown
 */
function businessRuleToMarkdown(rule: BusinessRule): string {
  const lines: string[] = [];

  lines.push(`### ${rule.title}`);
  lines.push(rule.description);
  if (rule.requirement) lines.push(`- 要件: ${rule.requirement}`);
  if (rule.fileReferences.length > 0) {
    lines.push('**関連ファイル**:');
    rule.fileReferences.forEach(ref => lines.push(fileReferenceToMarkdown(ref)));
  }

  return lines.join('\n');
}

/**
 * 共通化: 配列を変換（空の場合は理由表示）
 */
function formatSection<T>(
  items: T[],
  absentReason: string | undefined,
  formatter: (item: T) => string,
  defaultMessage: string = '該当なし'
): string {
  if (items.length === 0) {
    return absentReason ? `${defaultMessage}（${absentReason}）` : defaultMessage;
  }
  return items.map(formatter).join('\n\n');
}

/**
 * MCPツール出力 → サブIssue本文のMarkdown
 */
export async function convertToSubIssueMarkdown(
  data: GuidelinesOutput,
  issueNumber: number,
  issueTitle: string
): Promise<string> {
  // テンプレートを読み込み
  const templatePath = join(__dirname, '../templates/sub-issue-template.md');
  let template = await Bun.file(templatePath).text();

  // 各セクションをMarkdownに変換
  const businessRulesMarkdown = formatSection(
    data.businessRules,
    data.businessRulesAbsentReason,
    businessRuleToMarkdown
  );

  const reviewBusinessRulesMarkdown = formatSection(
    data.reviewGuidelines.businessRules,
    data.reviewGuidelines.businessRulesAbsentReason,
    checklistItemToMarkdown,
    '特になし'
  );

  const reviewImplementationMarkdown = formatSection(
    data.reviewGuidelines.implementation,
    data.reviewGuidelines.implementationAbsentReason,
    checklistItemToMarkdown,
    '特になし'
  );

  const reviewAdditionalMarkdown = formatSection(
    data.reviewGuidelines.additional,
    data.reviewGuidelines.additionalAbsentReason,
    checklistItemToMarkdown,
    '特になし'
  );

  // 新規機能テスト観点
  const testNewFeatureNormalMarkdown = formatSection(
    data.testGuidelines.newFeature.normal,
    data.testGuidelines.newFeature.normalAbsentReason,
    testCaseToMarkdown
  );

  const testNewFeatureEdgeCaseMarkdown = formatSection(
    data.testGuidelines.newFeature.edgeCase,
    data.testGuidelines.newFeature.edgeCaseAbsentReason,
    testCaseToMarkdown
  );

  const testNewFeatureErrorMarkdown = formatSection(
    data.testGuidelines.newFeature.error,
    data.testGuidelines.newFeature.errorAbsentReason,
    testCaseToMarkdown
  );

  // デグレチェックテスト観点
  const testRegressionNormalMarkdown = formatSection(
    data.testGuidelines.regression.normal,
    data.testGuidelines.regression.normalAbsentReason,
    testCaseToMarkdown
  );

  const testRegressionEdgeCaseMarkdown = formatSection(
    data.testGuidelines.regression.edgeCase,
    data.testGuidelines.regression.edgeCaseAbsentReason,
    testCaseToMarkdown
  );

  const testRegressionErrorMarkdown = formatSection(
    data.testGuidelines.regression.error,
    data.testGuidelines.regression.errorAbsentReason,
    testCaseToMarkdown
  );

  // テンプレートの変数を置換
  template = template.replace(/\{\{PARENT_ISSUE_NUMBER\}\}/g, String(issueNumber));
  template = template.replace(/\{\{BUSINESS_RULES\}\}/g, businessRulesMarkdown);
  template = template.replace(/\{\{REVIEW_BUSINESS_RULES\}\}/g, reviewBusinessRulesMarkdown);
  template = template.replace(/\{\{REVIEW_IMPLEMENTATION\}\}/g, reviewImplementationMarkdown);
  template = template.replace(/\{\{REVIEW_ADDITIONAL\}\}/g, reviewAdditionalMarkdown);

  // 新規機能テスト観点
  template = template.replace(/\{\{TEST_NEW_FEATURE_NORMAL\}\}/g, testNewFeatureNormalMarkdown);
  template = template.replace(/\{\{TEST_NEW_FEATURE_EDGE_CASE\}\}/g, testNewFeatureEdgeCaseMarkdown);
  template = template.replace(/\{\{TEST_NEW_FEATURE_ERROR\}\}/g, testNewFeatureErrorMarkdown);

  // デグレチェックテスト観点
  template = template.replace(/\{\{TEST_REGRESSION_NORMAL\}\}/g, testRegressionNormalMarkdown);
  template = template.replace(/\{\{TEST_REGRESSION_EDGE_CASE\}\}/g, testRegressionEdgeCaseMarkdown);
  template = template.replace(/\{\{TEST_REGRESSION_ERROR\}\}/g, testRegressionErrorMarkdown);

  return template;
}

