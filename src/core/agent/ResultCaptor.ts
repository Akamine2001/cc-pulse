import type {
  AggregatedNewsOutput,
  CapturedNewsData,
  OutputAggregatedNewsInput,
  OutputCollectedNewsInput,
  SearchSimilarInput,
} from './types';

/**
 * ツール呼び出しの結果をキャプチャし、整理する責務を持つクラス
 *
 * onToolUseコールバックから呼び出されることを想定しており、
 * cc-pulseのニュース収集プロセスに特化したロジックを含む。
 */
export class ResultCaptor {
  private aggregatedOutput: AggregatedNewsOutput | null = null;
  private iterations = 0;
  private similarityChecks = new Map<string, string>();

  /**
   * ツール呼び出しを処理し、必要な情報をキャプチャする
   *
   * @param toolName 呼び出されたツール名
   * @param input ツールに渡された入力
   * @param toolId ツール呼び出しの一意のID
   */
  public handleToolCall(toolName: string, input: unknown, toolId: string): void {
    this.iterations++;

    if (toolName === 'mcp__embedding__search_similar') {
      const typedInput = input as SearchSimilarInput;
      const queryText = typedInput.query_text || '';
      this.similarityChecks.set(toolId, queryText);
      console.log(`\n🔍 [Similarity Check ${this.iterations}]`);
      console.log(`   Query: ${queryText.substring(0, 80)}...`);
    }

    if (toolName === 'mcp__output__output_collected_news') {
      const typedInput = input as OutputCollectedNewsInput;
      console.log(
        `\n🚚 [Collected News] ${typedInput.articles.length} articles received.`
      );
    }

    if (toolName === 'mcp__output__output_aggregated_news') {
      this.aggregatedOutput = input as OutputAggregatedNewsInput;
    }
  }

  /**
   * キャプチャしたデータを取得する
   * @returns キャプチャされたニュースデータ
   */
  public getCapturedData(): CapturedNewsData {
    return {
      aggregatedOutput: this.aggregatedOutput,
      iterations: this.iterations,
      similarityChecks: this.similarityChecks,
    };
  }
}
