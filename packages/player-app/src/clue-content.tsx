import type { ResolvedClueContent, ResolvedMediaRef } from '@gameshow/schema';
import { Button } from '@gameshow/ui';
import { useState } from 'react';

export function mediaUrlsFor(ref: ResolvedMediaRef | undefined): string[] {
  if (!ref) return [];
  return ref.kind === 'slideshow' ? ref.urls : [ref.url];
}

/**
 * Uncontrolled (no `index`/`onNavigate`) when used for content nobody but the
 * host sees (e.g. the correct answer) — keeps its own local position with
 * nav buttons, same as before this existed as a shared component. Controlled
 * when `index` is passed: with `onNavigate`, it's the host's clue view (nav
 * buttons dispatch to the server so contestants stay in sync); without it,
 * it's a contestant's read-only view of the host's position — no buttons.
 */
function Slideshow({
  urls,
  index,
  onNavigate,
}: {
  urls: string[];
  index?: number;
  onNavigate?: (index: number) => void;
}) {
  const [localIndex, setLocalIndex] = useState(0);
  const current = index ?? localIndex;
  const url = urls[current];
  const interactive = index === undefined || onNavigate !== undefined;
  const navigate = onNavigate ?? setLocalIndex;

  return (
    <div className="flex flex-col items-center gap-2">
      {url && <img src={url} alt="" className="max-h-64 rounded-md border border-border" />}
      {interactive && (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={current === 0}
            onClick={() => navigate(current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={current === urls.length - 1}
            onClick={() => navigate(current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function MediaRenderer({
  media,
  slideIndex,
  onSlideNavigate,
}: {
  media: ResolvedMediaRef;
  slideIndex?: number;
  onSlideNavigate?: (index: number) => void;
}) {
  switch (media.kind) {
    case 'image':
      return <img src={media.url} alt="" className="max-h-64 rounded-md border border-border" />;
    case 'audio':
      // biome-ignore lint/a11y/useMediaCaption: uploaded media has no caption track
      return <audio controls src={media.url} className="w-full" />;
    case 'video':
      return (
        // biome-ignore lint/a11y/useMediaCaption: uploaded media has no caption track
        <video controls src={media.url} className="max-h-64 rounded-md border border-border" />
      );
    case 'slideshow':
      return <Slideshow urls={media.urls} index={slideIndex} onNavigate={onSlideNavigate} />;
  }
}

export function ClueContentView({
  content,
  slideIndex,
  onSlideNavigate,
}: {
  content: ResolvedClueContent;
  slideIndex?: number;
  onSlideNavigate?: (index: number) => void;
}) {
  return (
    <>
      {content.text && <span className="text-strong">{content.text}</span>}
      {content.media && (
        <MediaRenderer
          media={content.media}
          slideIndex={slideIndex}
          onSlideNavigate={onSlideNavigate}
        />
      )}
    </>
  );
}
