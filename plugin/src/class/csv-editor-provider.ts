/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { t } from 'i18next';
import * as vscode from 'vscode';

import { CSV_VIEWER_VIEW_TYPE } from '@shared/flavor';

/** Maximum number of rendering lines */
const MAX_RENDER_ROWS = 1000;

/**
 * CSV Editor Provider - Responsible for rendering CSV files into tables
 */
export class CsvEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = CSV_VIEWER_VIEW_TYPE;

  /**
   * Parse CSV text into 2D array
   * Supports RFC 4180 standard CSV format
   */
  private parseCsv(text: string): string[][] {
    try {
      const rows: string[][] = [];

      if (!text || text.trim().length === 0) {
        return rows;
      }

      // Simplify parsing logic and use more reliable methods
      const lines: string[] = [];
      let currentLine = '';
      let inQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = i + 1 < text.length ? text[i + 1] : null;

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // escaped double quotes
            currentLine += '"';
            i++; // skip next quote
          }
          else {
            // Toggle quote status
            inQuotes = !inQuotes;
            currentLine += char;
          }
        }
        else if ((char === '\n' || char === '\r') && !inQuotes) {
          // end of line
          if (char === '\r' && nextChar === '\n') {
            i++; // Skip \n
          }

          if (currentLine.trim() || lines.length === 0) {
            lines.push(currentLine);
          }

          currentLine = '';
        }
        else {
          currentLine += char;
        }
      }

      // add last line
      if (currentLine.trim() || lines.length === 0) {
        lines.push(currentLine);
      }

      // Parse array of fields per row
      for (const line of lines) {
        if (!line.trim() && rows.length > 0) {
          continue; // Skip empty lines (except the first line)
        }

        const fields: string[] = [];
        let currentField = '';
        let fieldInQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = i + 1 < line.length ? line[i + 1] : null;

          if (char === '"') {
            if (fieldInQuotes && nextChar === '"') {
              currentField += '"';
              i++; // skip next quote
            }
            else {
              fieldInQuotes = !fieldInQuotes;
            }
          }
          else if (char === ',' && !fieldInQuotes) {
            fields.push(currentField);
            currentField = '';
          }
          else {
            currentField += char;
          }
        }

        // Add last field
        fields.push(currentField);
        rows.push(fields);
      }

      return rows;
    }
    catch (error) {
      console.error('CSV parse error:', error);

      // Return an empty array or a single line of error information
      return [
        [
          t('csv.parseError'),
          String(error),
        ],
      ];
    }
  }

  /**
   * Generate HTML content
   */
  private getHtmlForWebview(csvData: string[][]): string {
    const displayRows = csvData.slice(0, MAX_RENDER_ROWS);
    const isOverMaxRows = csvData.length > MAX_RENDER_ROWS;
    const rowSummary = isOverMaxRows
      ? t('csv.rowsCountTruncated', {
        count: csvData.length,
        max: MAX_RENDER_ROWS,
      })
      : t('csv.rowsCountOnly', { count: csvData.length });

    // Generate header
    let headerHtml = '';

    if (displayRows.length > 0) {
      headerHtml = '<thead><tr>';
      const headerRow = displayRows[0];

      for (const cell of headerRow) {
        headerHtml += `<th>${this.escapeHtml(cell)}</th>`;
      }

      headerHtml += '</tr></thead>';
    }

    // Generate table body
    let bodyHtml = '<tbody>';

    for (let i = 1; i < displayRows.length; i++) {
      bodyHtml += '<tr>';

      for (const cell of displayRows[i]) {
        bodyHtml += `<td>${this.escapeHtml(cell)}</td>`;
      }

      bodyHtml += '</tr>';
    }

    bodyHtml += '</tbody>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(t('csv.tableViewTitle'))}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 0;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
        }
        
        .container {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            padding: 20px;
        }
        
        .table-container {
            flex: 1;
            overflow: auto;
            width: 100%;
            height: 100%;
            margin-top: 12px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 100%;
            border: none;
        }
        
        th {
            background-color: var(--vscode-editor-selectionBackground);
            color: var(--vscode-editor-foreground);
            font-weight: 600;
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
            border-right: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        th:last-child {
            border-right: none;
        }
        
        td {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            border-right: 1px solid var(--vscode-panel-border);
            word-wrap: break-word;
            max-width: 300px;
        }
        
        td:last-child {
            border-right: none;
        }
        
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        tr:nth-child(even) {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        
        tr:nth-child(even):hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .empty {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <span>${this.escapeHtml(rowSummary)}</span>
        <div class="table-container">
            ${
              displayRows.length > 0
                ? `<table>
                ${headerHtml}
                ${bodyHtml}
            </table>`
                : `<div class="empty">${this.escapeHtml(t('csv.fileEmpty'))}</div>`
            }
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * HTML escaping
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Parse and return Webview content
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    try {
      // Set Webview options
      webviewPanel.webview.options = { enableScripts: true };

      // Initialization content
      const updateWebview = () => {
        try {
          const text = document.getText();
          const csvData = this.parseCsv(text);

          webviewPanel.webview.html = this.getHtmlForWebview(csvData);
        }
        catch (error) {
          console.error('Webview update error:', error);
          // Show error page
          webviewPanel.webview.html = this.getErrorHtml(String(error));
        }
      };

      // Monitor document changes
      const changeDocumentSubscription =
        vscode.workspace.onDidChangeTextDocument((e) => {
          if (e.document.uri.toString() === document.uri.toString()) {
            updateWebview();
          }
        });

      // Clean up subscription
      webviewPanel.onDidDispose(() => {
        changeDocumentSubscription.dispose();
      });

      // initial update
      updateWebview();
    }
    catch (error) {
      console.error('Error initializing CSV editor:', error);
      webviewPanel.webview.html = this.getErrorHtml(String(error));
    }
  }

  /**
   * Generate error page HTML
   */
  private getErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(t('csv.errorPageTitle'))}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 40px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .error-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            background-color: var(--vscode-inputValidation-errorBackground);
        }
        h1 {
            color: var(--vscode-inputValidation-errorForeground);
            margin-bottom: 16px;
        }
        pre {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>${this.escapeHtml(t('csv.errorLoadFailed'))}</h1>
        <p>${this.escapeHtml(t('csv.errorDetailsLabel'))}</p>
        <pre>${this.escapeHtml(errorMessage)}</pre>
    </div>
</body>
</html>`;
  }
}
