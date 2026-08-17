import { listMediaRefs, type Round, type RoundMediaManifestEntry } from '@gameshow/schema';
import type JSZip from 'jszip';

/**
 * Side table of attached files, keyed by the `assetId` referenced from a
 * draft's `MediaRef`s — kept alongside the schema-shaped draft rather than
 * inside it, mirroring `wheel-draft-store.ts`'s flat draft shape.
 */
export type AssetTable = Record<string, File>;

/**
 * `assetId -> kind` for every real file a round's data references — a
 * `slideshow` ref's `assetIds` each decompose to their own `'image'` entry
 * (mirrors `player-app/src/round-import.ts`'s `expectedAssetKinds`), since
 * `'slideshow'` itself is never a per-file manifest kind.
 */
function expectedAssetKinds(round: Round): Map<string, 'image' | 'audio' | 'video'> {
  const expected = new Map<string, 'image' | 'audio' | 'video'>();
  for (const ref of listMediaRefs(round)) {
    if (ref.kind === 'slideshow') {
      for (const assetId of ref.assetIds) expected.set(assetId, 'image');
    } else {
      expected.set(ref.assetId, ref.kind);
    }
  }
  return expected;
}

/**
 * Writes `assets/manifest.json` + one `assets/<assetId>` file per `MediaRef`
 * the round references, reading each file's real `blob.type` as its
 * `contentType` — a no-op (no `assets/` folder at all) for a media-free
 * round, same as Wheel of Fortune's export today.
 */
export async function addMediaAssetsToZip(
  zip: JSZip,
  round: Round,
  assets: AssetTable,
): Promise<void> {
  const expected = expectedAssetKinds(round);
  if (expected.size === 0) return;

  const manifest: RoundMediaManifestEntry[] = [];
  for (const [assetId, kind] of expected) {
    const file = assets[assetId];
    if (!file) throw new Error(`Missing attached file for asset ${assetId}`);
    manifest.push({ assetId, kind, contentType: file.type });
    zip.file(`assets/${assetId}`, file);
  }
  zip.file('assets/manifest.json', JSON.stringify(manifest, null, 2));
}
