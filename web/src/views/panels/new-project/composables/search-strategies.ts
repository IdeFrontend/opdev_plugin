import {
  ref, type Ref,
} from 'vue';
import { remotePathSearch } from '@web/apis';

export type SearchType = 'projectPath' | 'projectSH';

export interface SearchStrategy {
  search(keyword: string): Promise<void>;
  getOptions(): Ref<Array<{ value: string }>>;
  getLoading(): Ref<boolean>;
  getType(): SearchType;
}

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
      const {
        type, list = [],
      } = result;
      const mapped = list.map((item) => ({ value: item.path }));

      if (type === 'projectPath') {
        this.options.value = mapped;
        this.loading.value = false;
      }
    }
    catch (error) {
      this.loading.value = false;
      console.error('远程搜索失败:', error);
    }
  }

  private buildDefaultSearchPath(value = ''): string {
    if (value) {
      return value;
    }

    return '/';
  }
}

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
      const {
        type, list = [],
      } = result;
      const mapped = list.map((item) => ({ value: item.path }));

      if (type === 'projectSH') {
        this.options.value = mapped;
        this.loading.value = false;
      }
    }
    catch (error) {
      this.loading.value = false;
      console.error('远程搜索失败:', error);
    }
  }

  private buildDefaultSearchPath(value = ''): string {
    if (value) {
      return value;
    }

    return '/';
  }
}

export class SearchStrategyFactory {
  private static strategies: Map<SearchType, SearchStrategy> = new Map();

  static getStrategy(type: SearchType): SearchStrategy {
    if (!this.strategies.has(type)) {
      if (type === 'projectPath') {
        this.strategies.set(type, new ProjectPathSearchStrategy());
      }
      else if (type === 'projectSH') {
        this.strategies.set(type, new ProjectSHSearchStrategy());
      }
    }

    return this.strategies.get(type)!;
  }
}
