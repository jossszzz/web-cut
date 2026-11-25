/**
 * Contabilidad LRU con presupuesto (sin recursos propios): registra el coste
 * de cada clave y, al superar el presupuesto, indica qué claves expulsar
 * empezando por las menos usadas recientemente. Quien la usa libera el
 * recurso real (p. ej. `ImageBitmap.close()`).
 */
export class LruBudget<K> {
  private readonly costs = new Map<K, number>();
  private total = 0;

  constructor(readonly budget: number) {}

  get used(): number {
    return this.total;
  }

  has(key: K): boolean {
    return this.costs.has(key);
  }

  /** Marca la clave como usada ahora mismo. */
  touch(key: K): void {
    const cost = this.costs.get(key);
    if (cost === undefined) return;
    this.costs.delete(key);
    this.costs.set(key, cost);
  }

  /**
   * Añade (o actualiza) una clave y devuelve las claves a expulsar para volver
   * al presupuesto. Nunca expulsa la clave recién añadida.
   */
  add(key: K, cost: number): K[] {
    this.remove(key);
    this.costs.set(key, cost);
    this.total += cost;
    const evicted: K[] = [];
    for (const [candidate, candidateCost] of this.costs) {
      if (this.total <= this.budget) break;
      if (candidate === key) continue;
      this.costs.delete(candidate);
      this.total -= candidateCost;
      evicted.push(candidate);
    }
    return evicted;
  }

  remove(key: K): void {
    const cost = this.costs.get(key);
    if (cost === undefined) return;
    this.costs.delete(key);
    this.total -= cost;
  }

  clear(): void {
    this.costs.clear();
    this.total = 0;
  }
}
