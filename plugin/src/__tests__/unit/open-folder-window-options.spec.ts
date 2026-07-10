import { buildOpenFolderWindowOptions } from '@plugin/helpers/open-folder-window-options';

describe('buildOpenFolderWindowOptions (issue #34)', () => {
  it('forces a new window when forceNewWindow is true', () => {
    expect(buildOpenFolderWindowOptions(true))
      .toEqual({ forceNewWindow: true });
  });

  it('forces reuse of the current window when forceNewWindow is false', () => {
    // Regression for #34: must NOT emit { forceNewWindow: false } (VS Code would then
    // defer to window.openFoldersInNewWindow and spawn a new window). It must force reuse.
    expect(buildOpenFolderWindowOptions(false))
      .toEqual({ forceReuseWindow: true });
  });

  it('never sets forceNewWindow to false', () => {
    const reuse = buildOpenFolderWindowOptions(false) as Record<string, unknown>;

    expect(reuse.forceNewWindow)
      .toBeUndefined();
  });

  it('emits exactly one mutually-exclusive flag', () => {
    for (const forceNew of [
      true,
      false,
    ]) {
      const opts = buildOpenFolderWindowOptions(forceNew) as Record<string, unknown>;

      expect(Object.keys(opts))
        .toHaveLength(1);
    }
  });
});
