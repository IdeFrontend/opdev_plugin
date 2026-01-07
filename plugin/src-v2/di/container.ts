import { DIToken } from './tokens';

/**
 * 服务工厂函数类型
 */
type Factory<T> = (container: Container)=> T;

/**
 * 简化版依赖注入容器
 * 不使用 inversify,保持轻量级
 */
export class Container {
  private services = new Map<DIToken, unknown>();
  private factories = new Map<DIToken, Factory<unknown>>();
  private singletons = new Set<DIToken>();

  /**
   * 注册单例服务
   */
  registerSingleton<T>(token: DIToken, factory: Factory<T>): void {
    this.factories.set(token, factory);
    this.singletons.add(token);
  }

  /**
   * 注册瞬态服务(每次获取都创建新实例)
   */
  registerTransient<T>(token: DIToken, factory: Factory<T>): void {
    this.factories.set(token, factory);
  }

  /**
   * 注册实例
   */
  registerInstance<T>(token: DIToken, instance: T): void {
    this.services.set(token, instance);
  }

  /**
   * 获取服务
   */
  get<T>(token: DIToken): T {
    // 如果已经有实例,直接返回
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }

    // 如果没有工厂,抛出错误
    const factory = this.factories.get(token);

    if (!factory) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    // 创建实例
    const instance = factory(this) as T;

    // 如果是单例,缓存实例
    if (this.singletons.has(token)) {
      this.services.set(token, instance);
    }

    return instance;
  }

  /**
   * 检查服务是否已注册
   */
  has(token: DIToken): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  /**
   * 清空容器
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }
}
