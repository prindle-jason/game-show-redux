import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaField } from './MediaField.js';
import type { AssetTable } from './media-assets.js';

function pngFile(name = 'a.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

function mp3File(): File {
  return new File([new Uint8Array([4, 5])], 'a.mp3', { type: 'audio/mpeg' });
}

function Harness({ initialAssets = {} }: { initialAssets?: AssetTable }) {
  const assets = { ...initialAssets };
  let media: Parameters<typeof MediaField>[0]['media'];

  function Wrapper() {
    return (
      <MediaField
        label="Clue media"
        media={media}
        assets={assets}
        attachAsset={(file) => {
          const assetId = `asset-${Object.keys(assets).length + 1}`;
          assets[assetId] = file;
          return assetId;
        }}
        onChange={(next) => {
          media = next;
          rerender();
        }}
      />
    );
  }

  const { rerender: doRerender, ...utils } = render(<Wrapper />);
  function rerender() {
    doRerender(<Wrapper />);
  }
  return utils;
}

describe('MediaField', () => {
  afterEach(() => cleanup());

  it('attaching a single image renders a preview and remove button', async () => {
    Harness({});
    const input = screen.getByLabelText('Clue media');
    fireEvent.change(input, { target: { files: [pngFile()] } });

    await screen.findByRole('button', { name: 'Remove media' });
    expect(document.querySelector('img')).toBeInTheDocument();
  });

  it('attaching a single audio file renders an audio control', async () => {
    Harness({});
    const input = screen.getByLabelText('Clue media');
    fireEvent.change(input, { target: { files: [mp3File()] } });

    await screen.findByRole('button', { name: 'Remove media' });
    expect(document.querySelector('audio')).toBeInTheDocument();
  });

  it('attaching multiple images becomes a slideshow', async () => {
    Harness({});
    const input = screen.getByLabelText('Clue media');
    fireEvent.change(input, { target: { files: [pngFile('a.png'), pngFile('b.png')] } });

    await screen.findAllByRole('button', { name: 'Remove slide' });
    expect(document.querySelectorAll('img')).toHaveLength(2);
  });

  it('removing a slide leaves the rest of the slideshow intact', async () => {
    Harness({});
    const input = screen.getByLabelText('Clue media');
    fireEvent.change(input, { target: { files: [pngFile('a.png'), pngFile('b.png')] } });
    await screen.findAllByRole('button', { name: 'Remove slide' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove slide' })[0] as HTMLElement);

    await vi.waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(1));
  });

  it('removing media clears it back to the file picker', async () => {
    Harness({});
    const input = screen.getByLabelText('Clue media');
    fireEvent.change(input, { target: { files: [pngFile()] } });
    await screen.findByRole('button', { name: 'Remove media' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove media' }));

    expect(await screen.findByLabelText('Clue media')).toHaveAttribute('type', 'file');
  });
});
