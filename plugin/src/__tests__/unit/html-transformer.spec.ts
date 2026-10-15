/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Unit tests for HtmlTransformer: dist/HTML loading, dev-server fetching,
 * template value substitution, and resource path rewriting for webviews.
 * The http module is mocked so no network traffic is ever attempted.
 */

jest.mock('http', () => ({ get: jest.fn() }));

jest.mock('vscode', () => {
  const nodePath = jest.requireActual<typeof import('path')>('path');

  const makeUri = (fsPath: string) => ({
    fsPath,
    toString: () => `mock-uri:${fsPath}`,
  });

  return {
    Uri: {
      file: (fsPath: string) => makeUri(fsPath),
      joinPath: (base: { fsPath: string }, ...segments: string[]) =>
        makeUri(nodePath.join(base.fsPath, ...segments)),
    },
  };
});

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { HtmlTransformer } from '@plugin/class/html-transformer';

type EventHandlerMap = Record<string, (...args: unknown[])=> void>;

function createFakeResponse(statusCode: number) {
  const handlers: EventHandlerMap = {};

  return {
    statusCode,
    resume: jest.fn(),
    on: jest.fn((event: string, cb: (...args: unknown[])=> void) => {
      handlers[event] = cb;
    }),
    emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.(...args);
    },
  };
}

function createFakeRequest() {
  const handlers: EventHandlerMap = {};

  return {
    on: jest.fn((event: string, cb: (...args: unknown[])=> void) => {
      handlers[event] = cb;
    }),
    emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.(...args);
    },
  };
}

function createFakeWebview(): vscode.Webview {
  const fake = {
    asWebviewUri: (uri: { fsPath: string }) => ({
      fsPath: uri.fsPath,
      toString: () => `webview-uri:${uri.fsPath}`,
    }),
  };

  return fake as unknown as vscode.Webview;
}

const httpGetMock = http.get as jest.Mock;

let tmpDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  tmpDirs.push(dir);

  return dir;
}

beforeEach(() => {
  delete process.env.MSTT_DEV_SERVER_URL;
  httpGetMock.mockReset();
});

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }

  tmpDirs = [];
});

describe('HtmlTransformer.fetchHtml', () => {
  let response: ReturnType<typeof createFakeResponse>;

  it('calls http.get with the requested url and resolves with the full body', async () => {
    httpGetMock.mockImplementation((url: string, cb: (res: unknown)=> void) => {
      response = createFakeResponse(200);
      cb(response);

      return createFakeRequest();
    });

    const promise = HtmlTransformer.fetchHtml('http://localhost:5173/x.html');

    response.emit('data', '<html>');
    response.emit('data', '</html>');
    response.emit('end');

    await expect(promise).resolves.toBe('<html></html>');
    expect(httpGetMock)
      .toHaveBeenCalledWith('http://localhost:5173/x.html', expect.any(Function));
  });

  it('rejects with the status code when the response is not 200', async () => {
    httpGetMock.mockImplementation((url: string, cb: (res: unknown)=> void) => {
      response = createFakeResponse(503);
      cb(response);

      return createFakeRequest();
    });

    await expect(HtmlTransformer.fetchHtml('http://localhost:5173/x.html')).rejects.toThrow('Status code: 503');
    expect(response.resume)
      .toHaveBeenCalled();
  });

  it('rejects when the request emits an error', async () => {
    let request: ReturnType<typeof createFakeRequest>;

    httpGetMock.mockImplementation((url: string, cb: (res: unknown)=> void) => {
      cb(createFakeResponse(200));
      request = createFakeRequest();

      return request;
    });

    const promise = HtmlTransformer.fetchHtml('http://localhost:5173/x.html');

    request!.emit('error', new Error('ECONNREFUSED'));

    await expect(promise).rejects.toThrow('ECONNREFUSED');
  });
});

describe('HtmlTransformer.processDevResourcePaths', () => {
  it('rewrites absolute src and href attributes and injects base after head', () => {
    const html = '<html><head><script src="/assets/main.js"></script><link href="/css/style.css"></head></html>';
    const result = HtmlTransformer.processDevResourcePaths(
      html,
      'http://localhost:5173',
      'http://localhost:5173/src/views/home/home.html',
    );

    expect(result)
      .toContain('src="http://localhost:5173/assets/main.js"');
    expect(result)
      .toContain('href="http://localhost:5173/css/style.css"');
    expect(result)
      .toContain('<head>\n    <base href="http://localhost:5173/src/views/home/">');
  });

  it('injects a head with base when the html has no head tag', () => {
    const result = HtmlTransformer.processDevResourcePaths(
      '<html><body></body></html>',
      'http://localhost:5173',
      'http://localhost:5173/src/views/home/home.html',
    );

    expect(result)
      .toContain('<html>\n<head><base href="http://localhost:5173/src/views/home/"></head>');
  });

  it('prepends base when neither head nor html tags exist', () => {
    const result = HtmlTransformer.processDevResourcePaths(
      '<body>bare</body>',
      'http://localhost:5173',
      'http://localhost:5173/src/views/home/home.html',
    );

    expect(result)
      .toBe('<base href="http://localhost:5173/src/views/home/">\n<body>bare</body>');
  });

  it('handles a current file url without a directory part', () => {
    const result = HtmlTransformer.processDevResourcePaths(
      '<html><head></head></html>',
      'http://localhost:5173',
      'home.html',
    );

    expect(result)
      .toContain('<base href="">');
  });
});

describe('HtmlTransformer.processResourcePaths', () => {
  const htmlFileDir = 'C:/web/dist';
  const htmlUri = {
    fsPath: htmlFileDir,
    toString: () => `mock-uri:${htmlFileDir}`,
  } as unknown as vscode.Uri;

  it('rewrites relative link, script and img paths using the webview uri', () => {
    const html = '<link rel="stylesheet" href="./style.css">'
      + '<script src="../js/app.js"></script>'
      + '<img src="logo.png" alt="x">';
    const result = HtmlTransformer.processResourcePaths(html, htmlUri, createFakeWebview(), htmlFileDir);

    expect(result)
      .toContain('webview-uri:' + path.resolve(htmlFileDir, './style.css'));
    expect(result)
      .toContain('webview-uri:' + path.resolve(htmlFileDir, '../js/app.js'));
    expect(result)
      .toContain('webview-uri:' + path.resolve(htmlFileDir, 'logo.png'));
  });

  it('resolves absolute paths against the html uri root', () => {
    const result = HtmlTransformer.processResourcePaths(
      '<script src="/vendor/lib.js"></script>',
      htmlUri,
    );

    expect(result)
      .toContain('mock-uri:' + path.join(htmlFileDir, '/vendor/lib.js'));
  });

  it('falls back to joinPath for relative paths without a file dir', () => {
    const result = HtmlTransformer.processResourcePaths('<script src="./app.js"></script>', htmlUri);

    expect(result)
      .toContain('mock-uri:' + path.join(htmlFileDir, './app.js'));
  });

  it('uses a plain file uri when no webview is provided', () => {
    const result = HtmlTransformer.processResourcePaths(
      '<script src="./app.js"></script>',
      htmlUri,
      undefined,
      htmlFileDir,
    );

    expect(result)
      .toContain('mock-uri:' + path.resolve(htmlFileDir, './app.js'));
  });

  it('leaves external resources untouched', () => {
    const html = '<link href="data:font/woff2;base64,AAA">'
      + '<script src="http://cdn/x.js"></script>'
      + '<script src="https://cdn/y.js"></script>'
      + '<img src="//cdn/z.png">'
      + '<link href="vscode-resource://res/icon.svg">';
    const result = HtmlTransformer.processResourcePaths(html, htmlUri);

    expect(result)
      .toBe(html);
  });
});

describe('HtmlTransformer.transformDistHtml', () => {
  it('reads the view from dist, applies template values and rewrites resources', async () => {
    const distPath = makeTempDir('html-transformer-dist-');
    const indexPath = path.join(distPath, 'src', 'views', 'home', 'home.html');

    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(
      indexPath,
      '<html><head><link rel="stylesheet" href="./style.css"></head><body>{{title}}</body></html>',
      'utf8',
    );

    const result = await HtmlTransformer.transformDistHtml(
      distPath,
      createFakeWebview(),
      'home',
      { title: 'Hello' },
    );

    expect(result)
      .toContain('Hello');
    expect(result).not.toContain('{{title}}');
    expect(result)
      .toContain('webview-uri:' + path.resolve(path.dirname(indexPath), './style.css'));
  });

  it('derives the view name from the last router segment', async () => {
    const distPath = makeTempDir('html-transformer-router-');
    const indexPath = path.join(distPath, 'src', 'views', 'sidebars', 'home', 'home.html');

    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, '<html><body>ok</body></html>', 'utf8');

    const result = await HtmlTransformer.transformDistHtml(distPath, createFakeWebview(), 'sidebars/home');

    expect(result)
      .toContain('ok');
  });

  it('replaces only the first occurrence of each template key', async () => {
    const distPath = makeTempDir('html-transformer-template-');
    const indexPath = path.join(distPath, 'src', 'views', 'home', 'home.html');

    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, '{{title}} and {{title}} and {{lang}}', 'utf8');

    const result = await HtmlTransformer.transformDistHtml(
      distPath,
      createFakeWebview(),
      'home',
      {
        title: 'Hello',
        lang: 'en',
      },
    );

    expect(result)
      .toBe('Hello and {{title}} and en');
  });

  it('throws a descriptive error when the view html is missing from dist', async () => {
    const distPath = makeTempDir('html-transformer-missing-');

    await expect(HtmlTransformer.transformDistHtml(distPath, createFakeWebview(), 'missing')).rejects.toThrow(/missing\.html not found in dist directory/);
  });

  it('fetches the view html from the dev server and rewrites resource paths', async () => {
    process.env.MSTT_DEV_SERVER_URL = 'http://localhost:5173';
    let response: ReturnType<typeof createFakeResponse>;

    httpGetMock.mockImplementation((url: string, cb: (res: unknown)=> void) => {
      response = createFakeResponse(200);
      cb(response);

      return createFakeRequest();
    });

    const promise = HtmlTransformer.transformDistHtml(
      path.join(os.tmpdir(), 'unused-dist'),
      createFakeWebview(),
      'panels/config',
      { lang: 'en' },
    );

    response.emit('data', '<html><head><script src="/assets/main.js"></script></head></html>');
    response.emit('end');

    const result = await promise;

    expect(httpGetMock)
      .toHaveBeenCalledWith(
        'http://localhost:5173/src/views/panels/config/config.html',
        expect.any(Function),
      );
    expect(result)
      .toContain('src="http://localhost:5173/assets/main.js"');
    expect(result)
      .toContain('<head>\n    <base href="http://localhost:5173/src/views/panels/config/">');
  });

  it('derives the view name from the last router segment in dev mode', async () => {
    process.env.MSTT_DEV_SERVER_URL = 'http://localhost:5173';
    let response: ReturnType<typeof createFakeResponse>;

    httpGetMock.mockImplementation((url: string, cb: (res: unknown)=> void) => {
      response = createFakeResponse(200);
      cb(response);

      return createFakeRequest();
    });

    const promise = HtmlTransformer.transformDistHtml(
      path.join(os.tmpdir(), 'unused-dist'),
      createFakeWebview(),
      'sidebars/home',
      {},
    );

    response.emit('data', '<html><head></head></html>');
    response.emit('end');

    await promise;

    expect(httpGetMock)
      .toHaveBeenCalledWith(
        'http://localhost:5173/src/views/sidebars/home/home.html',
        expect.any(Function),
      );
  });

  it('falls back to file mode when the dev server fetch fails', async () => {
    process.env.MSTT_DEV_SERVER_URL = 'http://localhost:5173';
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    httpGetMock.mockImplementation((url: string, cb: (res: unknown)=> void) => {
      cb(createFakeResponse(500));

      return createFakeRequest();
    });

    const distPath = makeTempDir('html-transformer-dev-fail-');

    await expect(HtmlTransformer.transformDistHtml(distPath, createFakeWebview())).rejects.toThrow(/Failed to transform HTML/);
    expect(errorSpy)
      .toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
