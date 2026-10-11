/** Shared, reference-counted terrain loading. Rendering owns leases, not textures. */
export interface TerrainAsset {key: string; asset: string; priority?: number;}
export interface TerrainAssetPort {
  exists(key: string): boolean;
  load(asset: TerrainAsset): Promise<boolean>;
  remove(key: string): void;
  pixels(key: string): number;
}
interface Entry {asset: TerrainAsset; owners: Set<object>; state: 'queued'|'loading'|'ready'|'failed'; retryAt: number;}
export class TerrainResidency {
  private entries = new Map<string, Entry>();
  private owners = new Map<object, Set<string>>();
  private active = 0;
  private disposed = false;
  constructor(private port: TerrainAssetPort, private concurrency = 2, private now = () => Date.now()) {}
  retain(owner: object, assets: readonly TerrainAsset[]): void {
    if (this.disposed) return;
    const desired = new Set(assets.map(asset => asset.key));
    for (const key of this.owners.get(owner) ?? []) if (!desired.has(key)) this.releaseKey(owner, key);
    this.owners.set(owner, desired);
    for (const asset of assets) {
      let entry = this.entries.get(asset.key);
      if (!entry) {
        entry = {asset, owners: new Set(), state: this.port.exists(asset.key) ? 'ready' : 'queued', retryAt: 0};
        this.entries.set(asset.key, entry);
      } else if (entry.asset.asset !== asset.asset) throw new Error(`Conflicting terrain assets for ${asset.key}`);
      entry.owners.add(owner);
      entry.asset.priority = Math.min(entry.asset.priority ?? Infinity, asset.priority ?? Infinity);
      if (entry.state === 'failed' && this.now() >= entry.retryAt) entry.state = 'queued';
    }
    this.pump();
  }
  release(owner: object): void {
    for (const key of this.owners.get(owner) ?? []) this.releaseKey(owner, key);
    this.owners.delete(owner);
  }
  private releaseKey(owner: object, key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.owners.delete(owner);
    // An abandoned in-flight result is removed when it completes. A later
    // owner can adopt it before then without starting a second request.
    if (!entry.owners.size && entry.state !== 'loading') this.evict(key);
  }
  private evict(key: string): void {
    if (this.port.exists(key)) this.port.remove(key);
    this.entries.delete(key);
  }
  private pump(): void {
    if (this.disposed) return;
    while (this.active < this.concurrency) {
      const entry = [...this.entries.values()].filter(value => value.state === 'queued' && value.owners.size)
        .sort((a,b) => (a.asset.priority ?? 0) - (b.asset.priority ?? 0))[0];
      if (!entry) return;
      entry.state = 'loading'; this.active++;
      void this.port.load(entry.asset).catch(() => false).then(ready => {
        this.active--;
        if (this.disposed || !entry.owners.size) this.evict(entry.asset.key);
        else {
          entry.state = ready && this.port.exists(entry.asset.key) ? 'ready' : 'failed';
          entry.retryAt = this.now() + 3000;
        }
        this.pump();
      });
    }
  }
  snapshot(): {textures:number; pixels:number; pending:number; failed:number} {
    const entries = [...this.entries.values()];
    const resident = entries.filter(entry => this.port.exists(entry.asset.key));
    return {textures: resident.length, pixels: resident.reduce((sum,entry) => sum + this.port.pixels(entry.asset.key),0),
      pending: entries.filter(entry => entry.state === 'loading' || entry.state === 'queued').length,
      failed: entries.filter(entry => entry.state === 'failed').length};
  }
  dispose(): void {
    this.disposed = true;
    for (const owner of [...this.owners.keys()]) this.release(owner);
  }
}

export interface TerrainView {x:number; y:number; width:number; height:number;}
export interface TerrainRectangle extends TerrainView {id:string;}
export function visibleTerrain<T extends TerrainRectangle>(tiles: readonly T[], view: TerrainView, margin = 0): T[] {
  return tiles.filter(tile => tile.x < view.x + view.width + margin && tile.x + tile.width > view.x - margin
    && tile.y < view.y + view.height + margin && tile.y + tile.height > view.y - margin)
    .sort((a,b) => Math.hypot(a.x+a.width/2-view.x-view.width/2,a.y+a.height/2-view.y-view.height/2)
      - Math.hypot(b.x+b.width/2-view.x-view.width/2,b.y+b.height/2-view.y-view.height/2));
}
