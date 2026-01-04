import { ref, type Ref } from 'vue';
import { remotePathSearch } from '@/apis';

/**
 * 搜索类型
 */
export type SearchType = 'projectPath' | 'projectSH';

/**
 * 搜索策略接口
 */
export interface SearchStrategy {
  search(keyword: string): Promise<void>;
  getOptions(): Ref<Array<{ value: string }>>;
  getLoading(): Ref<boolean>;
  getType(): SearchType;
}

/**
 * 项目路径搜索策略
 */
export class ProjectPathSearchStrategy implements SearchStrategy {
  private options = ref<Array<{ value: string }>>([]);
  private loading = ref(false);

  getType(): SearchType {
    return 'projectPath';
  }

  getOptions(): Ref<Array<{ value: string }>> {
    return this.options;
  }

  getLoading(): Ref<boolean> {
    return this.loading;
  }

  async search(keyword: string): Promise<void> {
    this.loading.value = true;
    try {
      const result = await remotePathSearch({
        type: 'projectPath',
        keyword: this.buildDefaultSearchPath(keyword.trim()),
      });
      const { type, list = [] } = result;
      const mapped = list.map((item) => ({ value: item.path }));

      if (type === 'projectPath') {
        this.options.value = mapped;
        this.loading.value = false;
      }
    } catch (error) {
      this.loading.value = false;
      console.error('远程搜索失败:', error);
    }
  }

  private buildDefaultSearchPath(value = ''): string {
    if (value) return value;

    return '/';
  }
}

/**
 * 环境变量脚本搜索策略
 */
export class ProjectSHSearchStrategy implements SearchStrategy {
  private options = ref<Array<{ value: string }>>([]);
  private loading = ref(false);

  getType(): SearchType {
    return 'projectSH';
  }

  getOptions(): Ref<Array<{ value: string }>> {
    return this.options;
  }

  getLoading(): Ref<boolean> {
    return this.loading;
  }

  async search(keyword: string): Promise<void> {
    this.loading.value = true;
    try {
      const result = await remotePathSearch({
        type: 'projectSH',
        keyword: this.buildDefaultSearchPath(keyword.trim()),
      });
      const { type, list = [] } = result;
      const mapped = list.map((item) => ({ value: item.path }));

      if (type === 'projectSH') {
        this.options.value = mapped;
        this.loading.value = false;
      }
    } catch (error) {
      this.loading.value = false;
      console.error('远程搜索失败:', error);
    }
  }

  private buildDefaultSearchPath(value = ''): string {
    if (value) return value;

    return '/';
  }
}

/**
 * 搜索策略工厂
 * 使用工厂模式创建搜索策略实例
 */
export class SearchStrategyFactory {
  private static strategies: Map<SearchType, SearchStrategy> = new Map();

  /**
   * 获取搜索策略（单例模式）
   */
  static getStrategy(type: SearchType): SearchStrategy {
    if (!this.strategies.has(type)) {
      if (type === 'projectPath') {
        this.strategies.set(type, new ProjectPathSearchStrategy());
      } else if (type === 'projectSH') {
        this.strategies.set(type, new ProjectSHSearchStrategy());
      }
    }

    return this.strategies.get(type)!;
  }
}

