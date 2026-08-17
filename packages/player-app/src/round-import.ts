import {
  listMediaRefs,
  MEDIA_LIMITS,
  type MediaRef,
  type Round,
  type RoundMediaManifestEntry,
  roundMediaManifestSchema,
  roundSchema,
} from '@gameshow/schema';
import JSZip from 'jszip';
import type { RoundMediaAsset } from './media-upload.js';

export class RoundImportError extends Error {}

export interface RoundImportResult {
  round: Round;
  assets: RoundMediaAsset[];
}

/**
 * `assetId -> kind` for every real file a round's data references — a
 * `slideshow` ref's `assetIds` each decompose to their own `'image'` entry
 * (mirrors `fixtures.ts`'s convention), since `'slideshow'` itself is never a
 * per-file kind.
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

async function loadZip(file: Blob): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(file);
  } catch {
    throw new RoundImportError('Not a valid zip file');
  }
}

async function parseRound(zip: JSZip): Promise<Round> {
  const text = await zip.file('round.json')?.async('string');
  if (text === undefined) throw new RoundImportError('Missing round.json');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RoundImportError('round.json is not valid JSON');
  }

  const result = roundSchema.safeParse(json);
  if (!result.success) {
    throw new RoundImportError(
      `round.json failed validation: ${result.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  return result.data;
}

async function parseManifest(zip: JSZip): Promise<RoundMediaManifestEntry[] | undefined> {
  const text = await zip.file('assets/manifest.json')?.async('string');
  if (text === undefined) return undefined;

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RoundImportError('assets/manifest.json is not valid JSON');
  }

  const result = roundMediaManifestSchema.safeParse(json);
  if (!result.success) {
    throw new RoundImportError(
      `assets/manifest.json failed validation: ${result.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  return result.data;
}

/**
 * Unzips a round exported by `builder-app` (see `docs/milestones/milestone-round-import.md`
 * for the zip layout), validating `round.json` and its asset manifest
 * all-or-nothing before returning anything — any corruption throws a
 * `RoundImportError` instead of partially importing.
 */
export async function importRoundZip(file: Blob): Promise<RoundImportResult> {
  const zip = await loadZip(file);
  const round = await parseRound(zip);
  const expected = expectedAssetKinds(round);
  const manifest = await parseManifest(zip);

  if (manifest === undefined) {
    if (expected.size > 0) throw new RoundImportError('Missing assets/manifest.json');
    return { round, assets: [] };
  }

  for (const assetId of expected.keys()) {
    if (!manifest.some((entry) => entry.assetId === assetId)) {
      throw new RoundImportError(`Missing asset in manifest: ${assetId}`);
    }
  }
  for (const entry of manifest) {
    const expectedKind = expected.get(entry.assetId);
    if (expectedKind === undefined) {
      throw new RoundImportError(`Unreferenced asset in manifest: ${entry.assetId}`);
    }
    if (expectedKind !== entry.kind) {
      throw new RoundImportError(
        `Asset ${entry.assetId} is declared as ${entry.kind} but the round references it as ${expectedKind}`,
      );
    }
  }

  const assets: RoundMediaAsset[] = [];
  for (const entry of manifest) {
    const zipEntry = zip.file(`assets/${entry.assetId}`);
    if (!zipEntry) throw new RoundImportError(`Missing asset file: ${entry.assetId}`);

    const limits = MEDIA_LIMITS[entry.kind];
    if (!limits.contentTypes.includes(entry.contentType)) {
      throw new RoundImportError(
        `Asset ${entry.assetId} has unsupported content type ${entry.contentType}`,
      );
    }

    const bytes = await zipEntry.async('uint8array');
    if (bytes.byteLength > limits.maxBytes) {
      throw new RoundImportError(
        `Asset ${entry.assetId} exceeds the ${limits.maxBytes}-byte limit`,
      );
    }

    assets.push({
      assetId: entry.assetId,
      kind: entry.kind satisfies MediaRef['kind'],
      blob: new Blob([new Uint8Array(bytes)], { type: entry.contentType }),
    });
  }

  return { round, assets };
}
