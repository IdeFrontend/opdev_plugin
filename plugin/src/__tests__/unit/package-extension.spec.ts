import { resolveVsixFileName } from '../../../../scripts/package-extension';

describe('package-extension', () => {
  it('uses the flavor vsixBaseName for the ascend-c-toolkit flavor', () => {
    expect(resolveVsixFileName({
      name: 'asc-toolkit',
      publisher: 'cann-pub',
      version: '1.4.6',
    }))
      .toBe('ascend-c-toolkit-1.4.6.vsix');
  });

  it('defaults to the manifest name for the huawei flavor', () => {
    expect(resolveVsixFileName({
      name: 'huawei-op-devtools-vscode-plugin',
      publisher: 'huawei',
      version: '1.4.6',
    }))
      .toBe('huawei-op-devtools-vscode-plugin-1.4.6.vsix');
  });

  it('falls back to the manifest name for unknown extension ids', () => {
    expect(resolveVsixFileName({
      name: 'other-extension',
      publisher: 'other-publisher',
      version: '0.0.1',
    }))
      .toBe('other-extension-0.0.1.vsix');
  });
});
