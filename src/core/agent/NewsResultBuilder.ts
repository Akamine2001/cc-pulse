import { CCPulseDatetime } from '../../utils/CCPulseDatetime';
import type { DailyNewsData } from '../../schemas/news-schemas';
import type { CapturedNewsData } from './types';

/**
 * キャプチャされたエージェント実行結果から最終的なDailyNewsDataを構築する責務を持つクラス
 */
export class NewsResultBuilder {
  /**
   * キャプチャされたデータと実行時情報からDailyNewsDataオブジェクトを構築する
   * @param params - 構築に必要なパラメータ
   * @param params.capturedData - ResultCaptorによってキャプチャされたデータ
   * @param params.startTime - 処理開始時刻
   * @param params.keywords - 検索キーワード
   * @param params.targetCount - 目標記事数
   * @returns 完成したDailyNewsDataオブジェクト
   * @throws Error 最終的な集約結果が存在しない場合
   */
  public build(params: {
    capturedData: CapturedNewsData;
    startTime: CCPulseDatetime;
    keywords: string[];
    targetCount: number;
  }): DailyNewsData {
    const { capturedData, startTime, keywords, targetCount } = params;
    const { aggregatedOutput, iterations } = capturedData;

    if (!aggregatedOutput) {
      throw new Error('Could not build news data: aggregated output is missing.');
    }

    const endTime = CCPulseDatetime.now();
    const duration = endTime.diff(startTime);

    // 各記事にUUIDを付与
    const newsWithIds = (aggregatedOutput.news || []).map((article) => ({
      id: crypto.randomUUID(),
      ...article,
    }));

    const dailyNews: DailyNewsData = {
      date: startTime.toDateString(),
      fetched_at: startTime.toISOString(),
      keywords,
      count: targetCount,
      news: newsWithIds,
      stats: {
        total_collected: aggregatedOutput.stats?.total_collected || 0,
        unique_articles: aggregatedOutput.stats?.unique_articles || 0,
        duplicate_removed: aggregatedOutput.stats?.duplicate_removed || 0,
        iterations,
        duration_ms: duration,
      },
      errors: [],
    };

    return dailyNews;
  }
}
