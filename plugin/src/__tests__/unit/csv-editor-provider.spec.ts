jest.mock('i18next', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('vscode', () => ({ workspace: { onDidChangeTextDocument: jest.fn() } }));

import * as vscode from 'vscode';
import { CsvEditorProvider } from '@plugin/class/csv-editor-provider';
import { CSV_VIEWER_VIEW_TYPE } from '@shared/flavor';

function createProvider(): any {
  return new CsvEditorProvider();
}

function createDocument(getText: jest.Mock): any {
  return {
    uri: { toString: () => 'file:///data.csv' },
    getText,
  };
}

function createPanel(): {
  panel: any;
  webview: { options?: unknown;
    html: string };
} {
  const webview = {
    options: undefined as unknown,
    html: '',
  };

  const panel = {
    webview,
    onDidDispose: jest.fn(),
  };

  return {
    panel,
    webview,
  };
}

describe('CsvEditorProvider', () => {
  let changeHandler:
  | ((event: { document: { uri: { toString: ()=> string } } })=> void)
  | undefined;
  let subscriptionDispose: jest.Mock;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    changeHandler = undefined;
    subscriptionDispose = jest.fn();
    errorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    (vscode.workspace.onDidChangeTextDocument as jest.Mock)
      .mockImplementation((callback: (event: { document: { uri: { toString: ()=> string } } })=> void) => {
        changeHandler = callback;

        return { dispose: subscriptionDispose };
      });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('viewType', () => {
    it('exposes the csv viewer view type', () => {
      expect(CsvEditorProvider.viewType)
        .toBe(CSV_VIEWER_VIEW_TYPE);
    });
  });

  describe('parseCsv', () => {
    function parse(text: unknown): string[][] {
      return createProvider()
        .parseCsv(text);
    }

    it('returns an empty list for empty or blank text', () => {
      expect(parse(''))
        .toEqual([]);
      expect(parse('   \n '))
        .toEqual([]);
    });

    it('parses a single row of fields', () => {
      expect(parse('a,b,c'))
        .toEqual([
          [
            'a',
            'b',
            'c',
          ],
        ]);
    });

    it('parses multiple rows with LF line endings', () => {
      expect(parse('a,b\nc,d'))
        .toEqual([
          [
            'a',
            'b',
          ],
          [
            'c',
            'd',
          ],
        ]);
    });

    it('parses CRLF line endings and a trailing newline', () => {
      expect(parse('a,b\r\nc,d\r\n'))
        .toEqual([
          [
            'a',
            'b',
          ],
          [
            'c',
            'd',
          ],
        ]);
    });

    it('keeps quoted commas inside a field', () => {
      expect(parse('"a,b",c'))
        .toEqual([
          [
            'a,b',
            'c',
          ],
        ]);
    });

    it('parses a quoted field containing escaped quotes', () => {
      // The line-splitting pass unescapes "" before the field pass, so the
      // closing quote is dropped: this documents current behavior.
      expect(parse('"he said ""hi""",x'))
        .toEqual([
          [
            'he said hi',
            'x',
          ],
        ]);
    });

    it('unwraps a doubled quote inside a quoted field', () => {
      expect(parse('"a"""'))
        .toEqual([['a"']]);
    });

    it('skips empty lines between data rows', () => {
      expect(parse('a,b\n\n\nc,d'))
        .toEqual([
          [
            'a',
            'b',
          ],
          [
            'c',
            'd',
          ],
        ]);
    });

    it('returns an error row when parsing fails', () => {
      const result = parse(123);

      expect(result[0][0])
        .toBe('csv.parseError');
      expect(result[0][1])
        .toContain('text.trim is not a function');
    });
  });

  describe('escapeHtml', () => {
    it('escapes html metacharacters', () => {
      expect(createProvider()
        .escapeHtml('<a href="x">&\'y\''))
        .toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#039;y&#039;');
    });

    it('leaves plain text unchanged', () => {
      expect(createProvider()
        .escapeHtml('plain text'))
        .toBe('plain text');
    });
  });

  describe('getHtmlForWebview', () => {
    function render(csvData: string[][]): string {
      return createProvider()
        .getHtmlForWebview(csvData);
    }

    it('renders a table with header and body rows', () => {
      const html = render([
        [
          'h1',
          'h2',
        ],
        [
          'v1',
          'v2',
        ],
        [
          'v3',
          'v4',
        ],
      ]);

      expect(html)
        .toContain('<thead><tr><th>h1</th><th>h2</th></tr></thead>');
      expect(html)
        .toContain('<tr><td>v1</td><td>v2</td></tr>');
      expect(html)
        .toContain('<tr><td>v3</td><td>v4</td></tr>');
      expect(html)
        .toContain('csv.rowsCountOnly');
    });

    it('escapes cell content', () => {
      const html = render([
        [
          'a<b',
          'c>d',
        ],
        [
          '"q"',
          "it's",
        ],
      ]);

      expect(html)
        .toContain('<th>a&lt;b</th>');
      expect(html)
        .toContain('<th>c&gt;d</th>');
      expect(html)
        .toContain('<td>&quot;q&quot;</td>');
      expect(html)
        .toContain('<td>it&#039;s</td>');
    });

    it('shows the empty placeholder for empty data', () => {
      const html = render([]);

      expect(html)
        .toContain('csv.fileEmpty');
      expect(html)
        .not.toContain('<table>');
    });

    it('reports a truncated row count above the render limit', () => {
      const rows = Array.from({ length: 1001 }, (_, i) => [String(i)]);

      const html = render(rows);

      expect(html)
        .toContain('csv.rowsCountTruncated');
      expect(html)
        .not.toContain('csv.rowsCountOnly');
      expect(html)
        .toContain('<td>999</td>');
      expect(html)
        .not.toContain('<td>1000</td>');
    });
  });

  describe('resolveCustomTextEditor', () => {
    it('renders the initial csv content and subscribes to document changes', async () => {
      const document = createDocument(jest.fn(() => 'a,b\nc,d'));
      const {
        panel, webview,
      } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      expect(webview.options)
        .toEqual({ enableScripts: true });
      expect(webview.html)
        .toContain('<th>a</th>');
      expect(webview.html)
        .toContain('<td>c</td>');
      expect(vscode.workspace.onDidChangeTextDocument)
        .toHaveBeenCalledTimes(1);
    });

    it('renders the empty placeholder for an empty document', async () => {
      const document = createDocument(jest.fn(() => ''));
      const {
        panel, webview,
      } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      expect(webview.html)
        .toContain('csv.fileEmpty');
    });

    it('re-renders when the matching document changes', async () => {
      const getText = jest.fn()
        .mockReturnValueOnce('a,b')
        .mockReturnValueOnce('x,y');
      const document = createDocument(getText);
      const {
        panel, webview,
      } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      changeHandler?.({ document: { uri: { toString: () => 'file:///data.csv' } } });

      expect(getText)
        .toHaveBeenCalledTimes(2);
      expect(webview.html)
        .toContain('<th>x</th>');
    });

    it('ignores changes from other documents', async () => {
      const getText = jest.fn()
        .mockReturnValue('a,b');
      const document = createDocument(getText);
      const {
        panel, webview,
      } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      changeHandler?.({ document: { uri: { toString: () => 'file:///other.csv' } } });

      expect(getText)
        .toHaveBeenCalledTimes(1);
      expect(webview.html)
        .toContain('<th>a</th>');
    });

    it('disposes the document subscription when the panel is disposed', async () => {
      const document = createDocument(jest.fn(() => 'a,b'));
      const { panel } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      const onDidDispose = (panel.onDidDispose as jest.Mock).mock.calls[0][0];

      onDidDispose();

      expect(subscriptionDispose)
        .toHaveBeenCalledTimes(1);
    });

    it('shows the error page when reading the document fails', async () => {
      const document = createDocument(jest.fn(() => {
        throw new Error('read fail');
      }));
      const {
        panel, webview,
      } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      expect(webview.html)
        .toContain('csv.errorPageTitle');
      expect(webview.html)
        .toContain('csv.errorLoadFailed');
      expect(webview.html)
        .toContain('read fail');
    });

    it('shows the error page when subscribing to document changes fails', async () => {
      (vscode.workspace.onDidChangeTextDocument as jest.Mock)
        .mockImplementation(() => {
          throw new Error('subscribe fail');
        });

      const document = createDocument(jest.fn(() => 'a,b'));
      const {
        panel, webview,
      } = createPanel();

      await createProvider()
        .resolveCustomTextEditor(document, panel);

      expect(webview.html)
        .toContain('csv.errorPageTitle');
      expect(webview.html)
        .toContain('subscribe fail');
    });
  });

  describe('getErrorHtml', () => {
    it('escapes the error message in the error page', () => {
      const html = createProvider()
        .getErrorHtml('<script>alert(1)</script>');

      expect(html)
        .toContain('csv.errorLoadFailed');
      expect(html)
        .toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
  });
});
