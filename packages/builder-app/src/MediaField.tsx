import type { MediaRef } from '@gameshow/schema';
import { Button, InputField } from '@gameshow/ui';
import { useEffect, useState } from 'react';
import type { AssetTable } from './media-assets.js';

function kindForFile(file: File): 'image' | 'audio' | 'video' | undefined {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return undefined;
}

/** Renders a local `File` via a revocable `URL.createObjectURL`, for previewing an attached asset before export. */
function FilePreview({ file, kind }: { file: File; kind: 'image' | 'audio' | 'video' }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  if (kind === 'image')
    return <img src={url} alt="" className="max-h-40 rounded-md border border-border" />;
  // biome-ignore lint/a11y/useMediaCaption: attached media has no caption track
  if (kind === 'audio') return <audio controls src={url} className="w-full" />;
  // biome-ignore lint/a11y/useMediaCaption: attached media has no caption track
  return <video controls src={url} className="max-h-40 rounded-md border border-border" />;
}

/**
 * A form control for one `ClueContent`'s optional media — no media yet shows
 * a file picker (a single file infers kind from its mime type; multiple
 * files are filtered to images and become a slideshow); media present shows
 * a preview and lets it be replaced or removed. Attached files are stored in
 * the draft's `assets` side table via `attachAsset`, matching `MediaRef`'s
 * `assetId`-only shape.
 */
export function MediaField({
  label,
  media,
  assets,
  attachAsset,
  onChange,
}: {
  label: string;
  media: MediaRef | undefined;
  assets: AssetTable;
  attachAsset: (file: File) => string;
  onChange: (media: MediaRef | undefined) => void;
}) {
  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    if (files.length === 1) {
      const file = files[0] as File;
      const kind = kindForFile(file);
      if (!kind) return;
      const assetId = attachAsset(file);
      onChange({ kind, assetId } as MediaRef);
      return;
    }

    const images = files.filter((file) => kindForFile(file) === 'image');
    if (images.length === 0) return;
    onChange({ kind: 'slideshow', assetIds: images.map((file) => attachAsset(file)) });
  }

  function handleAddSlide(fileList: FileList | null) {
    if (media?.kind !== 'slideshow' || !fileList || fileList.length === 0) return;
    const images = Array.from(fileList).filter((file) => kindForFile(file) === 'image');
    if (images.length === 0) return;
    onChange({
      kind: 'slideshow',
      assetIds: [...media.assetIds, ...images.map((file) => attachAsset(file))],
    });
  }

  function handleRemoveSlide(index: number) {
    if (media?.kind !== 'slideshow') return;
    const assetIds = media.assetIds.filter((_, i) => i !== index);
    onChange(assetIds.length > 0 ? { kind: 'slideshow', assetIds } : undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      {!media && (
        <InputField
          label={label}
          type="file"
          accept="image/*,audio/*,video/*"
          multiple
          onChange={(event) => handleFiles(event.target.files)}
        />
      )}
      {media && media.kind !== 'slideshow' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm font-medium text-muted">{label}</p>
          {assets[media.assetId] && (
            <FilePreview file={assets[media.assetId] as File} kind={media.kind} />
          )}
          <Button
            variant="danger"
            size="sm"
            className="self-start"
            onClick={() => onChange(undefined)}
          >
            Remove media
          </Button>
        </div>
      )}
      {media && media.kind === 'slideshow' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted">{label}</p>
          <ul className="flex flex-wrap gap-2">
            {media.assetIds.map((assetId, index) => (
              <li key={assetId} className="flex flex-col items-start gap-1">
                {assets[assetId] && <FilePreview file={assets[assetId] as File} kind="image" />}
                <Button variant="danger" size="sm" onClick={() => handleRemoveSlide(index)}>
                  Remove slide
                </Button>
              </li>
            ))}
          </ul>
          <InputField
            label={`${label} — add slide`}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => handleAddSlide(event.target.files)}
          />
          <Button
            variant="danger"
            size="sm"
            className="self-start"
            onClick={() => onChange(undefined)}
          >
            Remove media
          </Button>
        </div>
      )}
    </div>
  );
}
