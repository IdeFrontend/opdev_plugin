/**
 * Unit tests for ViewRenderer: HTML file resolution for panel / sidebar /
 * fallback views, template value substitution, dev-server fetching with
 * resource-path rewriting, and dev-server failure fallback to the dist file.
 *
 * Real fs is used against temp directories; the dev-server fetch is stubbed so
 * no network is touched.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as vscode from 'vscode';

import { HtmlTransformer } from '@plugin/class/html-transformer';
import { ViewRenderer } from '@plugin/core/view/view-render';

jest.mock('vscode', () => {
  const file = (fsPath: string) => ({
    fsPath,
    toString: () => `file://${fsPath}`,
  });

  return {
    Disposable: class {
      dispose(): void {}
    },
    Uri: {
      file,
      joinPath: (uri: { fsPath: string;
        toString: ()=> string }, ...segments: string[]) => {
        const fsPath = [
          uri.fsPath,
          ...segments,
        ].join('/');

        return {
          fsPath,
          toString: () => `file://${fsPath}`,
        };
      },
    },
  };
});

describe('ViewRenderer', () => {
  let tempRoot: string;
  let renderer: ViewRenderer;
  let webview: {
    html: string;
    asWebviewUri: jest.Mock;
  };

  const writeHtml = (relativePath: string, content: string): string => {
    const absolutePath = path.join(tempRoot, 'out', 'web', ...relativePath.split('/'));

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');

    return absolutePath;
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'view-render-'));
    renderer = new ViewRenderer({ extensionUri: vscode.Uri.file(tempRoot) } as unknown as vscode.ExtensionContext);
    webview = {
      html: '',
      asWebviewUri: jest.fn((uri: { fsPath: string }) => ({ toString: () => `aswebview:${uri.fsPath}` })),
    };
  });

  afterEach(() => {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
    delete process.env.MSTT_DEV_SERVER_URL;
  });

  it('renders a panel view with template values and rewritten resource paths', async () => {
    const htmlPath = writeHtml(
      'src/views/panels/config/config.html',
      '<html><head><title>{{title}}</title></head><body><script src="./app.js"></script></body></html>',
    );

    await renderer.render(webview, { title: 'Config Panel' }, 'config');

    const htmlFileDir = path.dirname(htmlPath);

    expect(webview.html)
      .toContain('Config Panel');
    expect(webview.html)
      .toContain(`src="aswebview:${path.join(htmlFileDir, 'app.js')}"`);
    expect(webview.asWebviewUri)
      .toHaveBeenCalled();
  });

  it('renders a sidebar view for entries in the sidebar list', async () => {
    writeHtml('src/views/sidebars/home/home.html', '<html><body>{{title}}</body></html>');

    await renderer.render(webview, { title: 'Home' }, 'home');

    expect(webview.html)
      .toContain('<body>Home</body>');
  });

  it('defaults unknown entries to the sidebar directory', async () => {
    writeHtml('src/views/sidebars/custom/custom.html', '<html><body>custom</body></html>');

    await renderer.render(webview, {}, 'custom');

    expect(webview.html)
      .toContain('<body>custom</body>');
  });

  it('replaces each template placeholder only once', async () => {
    writeHtml(
      'src/views/panels/new-project/new-project.html',
      '<div>{{title}}</div><div>{{title}}</div><span>{{footer}}</span>',
    );

    await renderer.render(webview, {
      title: 'A',
      footer: 'B',
    }, 'new-project');

    expect(webview.html)
      .toContain('<div>A</div><div>{{title}}</div><span>B</span>');
  });

  it('throws when no entry name is provided', async () => {
    await expect(renderer.render(webview))
      .rejects
      .toThrow('Entry name is required');
  });

  it('throws when the HTML file does not exist', async () => {
    await expect(renderer.render(webview, {}, 'config'))
      .rejects
      .toThrow('HTML file not found');
  });

  it('fetches from the dev server and rewrites dev resource paths', async () => {
    process.env.MSTT_DEV_SERVER_URL = 'http://localhost:5173';
    const fetchSpy = jest.spyOn(HtmlTransformer, 'fetchHtml')
      .mockResolvedValue('<html><head><script src="/app.js"></script></head><body>{{title}}</body></html>');

    await renderer.render(webview, { title: 'Dev' }, 'config');

    expect(fetchSpy)
      .toHaveBeenCalledWith('http://localhost:5173/src/views/panels/config/config.html');
    expect(webview.html)
      .toContain('src="http://localhost:5173/app.js"');
    expect(webview.html)
      .toContain('<base href="http://localhost:5173/src/views/panels/config/">');
    expect(webview.html)
      .toContain('Dev');
    fetchSpy.mockRestore();
  });

  it('falls back to the dist file when the dev server fetch fails', async () => {
    process.env.MSTT_DEV_SERVER_URL = 'http://localhost:5173';
    const consoleErrorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(HtmlTransformer, 'fetchHtml')
      .mockRejectedValue(new Error('connection refused'));

    writeHtml('src/views/panels/config/config.html', '<html><body>{{title}}</body></html>');

    await renderer.render(webview, { title: 'Local' }, 'config');

    expect(consoleErrorSpy)
      .toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'));
    expect(webview.html)
      .toContain('<body>Local</body>');
    fetchSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
