import { DIToken } from './tokens';

/**
 * Service factory function type
 */
type Factory<T> = (container: Container)=> T;

/**
 * Lightweight dependency injection container
 * No inversify; kept minimal
 */
export class Container {
  private services = new Map<DIToken, unknown>();
  private factories = new Map<DIToken, Factory<unknown>>();
  private singletons = new Set<DIToken>();

  /**
   * Register singleton service
   */
  registerSingleton<T>(token: DIToken, factory: Factory<T>): void {
    this.factories.set(token, factory);
    this.singletons.add(token);
  }

  /**
   * Register transient service (new instance per get)
   */
  registerTransient<T>(token: DIToken, factory: Factory<T>): void {
    this.factories.set(token, factory);
  }

  /**
   * Register instance
   */
  registerInstance<T>(token: DIToken, instance: T): void {
    this.services.set(token, instance);
  }

  /**
   * Get service
   */
  get<T>(token: DIToken): T {
    // Return cached instance if present
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }

    // No factory: throw
    const factory = this.factories.get(token);

    if (!factory) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    // Create instance
    const instance = factory(this) as T;

    // Cache if singleton
    if (this.singletons.has(token)) {
      this.services.set(token, instance);
    }

    return instance;
  }

  /**
   * Check if service is registered
   */
  has(token: DIToken): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  /**
   * Clear container
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }
}
