/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';

/**
 * CSV 编辑器提供者 - 负责将 CSV 文件渲染为表格
 */
export class CsvEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'csvViewer';
    
    // 最大文件大小限制（字符数），超过此大小将只显示部分内容
    private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    private static readonly MAX_DISPLAY_ROWS = 1000; // 最大显示行数

    /**
     * 简化的 CSV 解析方法
     * 使用正则表达式和简单的状态机来解析 CSV
     */
    private parseCsv(text: string): string[][] {
        const rows: string[][] = [];
        
        if (!text || text.trim().length === 0) {
            return rows;
        }
        
        // 限制文件大小
        let content = text;
        if (text.length > CsvEditorProvider.MAX_FILE_SIZE) {
            content = text.substring(0, CsvEditorProvider.MAX_FILE_SIZE);
            console.warn(`[CSV] 文件过大，已截断到 ${CsvEditorProvider.MAX_FILE_SIZE} 字符`);
        }
        
        // 使用正则表达式分割行，考虑引号内的换行符
        const lines: string[] = [];
        let currentLine = '';
        let inQuotes = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const nextChar = i + 1 < content.length ? content[i + 1] : '';
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 转义的双引号
                    currentLine += '"';
                    i++; // 跳过下一个引号
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                    currentLine += char;
                }
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // 行结束（不在引号内）
                if (char === '\r' && nextChar === '\n') {
                    i++; // 跳过 \n
                }
                if (currentLine.length > 0 || lines.length === 0) {
                    lines.push(currentLine);
                }
                currentLine = '';
            } else {
                currentLine += char;
            }
        }
        
        // 添加最后一行
        if (currentLine.length > 0 || lines.length === 0) {
            lines.push(currentLine);
        }
        
        // 解析每行为字段
        for (const line of lines) {
            if (line.trim().length === 0 && rows.length > 0) {
                continue; // 跳过空行（除了第一行）
            }
            
            const fields = this.parseLine(line);
            if (fields.length > 0 || rows.length === 0) {
                rows.push(fields);
            }
        }
        
        return rows;
    }
    
    /**
     * 解析单行 CSV 为字段数组
     */
    private parseLine(line: string): string[] {
        const fields: string[] = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = i + 1 < line.length ? line[i + 1] : '';
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 转义的双引号
                    currentField += '"';
                    i++; // 跳过下一个引号
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // 字段分隔符
                fields.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        
        // 添加最后一个字段
        fields.push(currentField.trim());
        
        return fields;
    }

    /**
     * 生成 HTML 内容
     */
    private getHtmlForWebview(csvData: string[][], isTruncated: boolean = false): string {
        // 限制显示行数
        const displayRows = csvData.slice(0, CsvEditorProvider.MAX_DISPLAY_ROWS);
        const hasMoreRows = csvData.length > CsvEditorProvider.MAX_DISPLAY_ROWS;
        
        // 如果没有数据
        if (displayRows.length === 0) {
            return this.getEmptyHtml();
        }
        
        // 确定列数（使用第一行的列数）
        const columnCount = displayRows[0]?.length || 0;
        
        // 生成表头
        let headerHtml = '<thead><tr>';
        if (displayRows.length > 0) {
            for (let j = 0; j < columnCount; j++) {
                const cell = displayRows[0][j] || '';
                headerHtml += `<th>${this.escapeHtml(cell)}</th>`;
            }
        }
        headerHtml += '</tr></thead>';
        
        // 生成表体
        let bodyHtml = '<tbody>';
        const dataStartIndex = displayRows.length > 1 ? 1 : 0;
        
        if (displayRows.length > 1) {
            // 有多行数据，从第二行开始显示
            for (let i = 1; i < displayRows.length; i++) {
                bodyHtml += '<tr>';
                const row = displayRows[i];
                for (let j = 0; j < columnCount; j++) {
                    const cell = j < row.length ? row[j] : '';
                    bodyHtml += `<td>${this.escapeHtml(cell)}</td>`;
                }
                bodyHtml += '</tr>';
            }
        } else {
            // 只有一行，显示空数据提示
            bodyHtml += '<tr>';
            for (let j = 0; j < columnCount; j++) {
                bodyHtml += '<td style="color: var(--vscode-descriptionForeground); font-style: italic;">（无数据）</td>';
            }
            bodyHtml += '</tr>';
        }
        bodyHtml += '</tbody>';
        
        // 生成警告信息
        let warningHtml = '';
        if (isTruncated || hasMoreRows) {
            warningHtml = '<div style="padding: 8px 12px; background-color: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); border-bottom: 1px solid var(--vscode-inputValidation-warningBorder);">';
            if (isTruncated) {
                warningHtml += '⚠️ 文件过大，仅显示部分内容';
            } else if (hasMoreRows) {
                warningHtml += `⚠️ 仅显示前 ${CsvEditorProvider.MAX_DISPLAY_ROWS} 行，共 ${csvData.length} 行`;
            }
            warningHtml += '</div>';
        }

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV 表格视图</title>
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
        }
        
        .table-container {
            flex: 1;
            overflow: auto;
            width: 100%;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 100%;
        }
        
        th {
            background-color: var(--vscode-editor-selectionBackground);
            color: var(--vscode-editor-foreground);
            font-weight: 600;
            padding: 10px 12px;
            text-align: left;
            border-bottom: 2px solid var(--vscode-panel-border);
            border-right: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        th:last-child {
            border-right: none;
        }
        
        td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            border-right: 1px solid var(--vscode-panel-border);
            word-wrap: break-word;
            word-break: break-word;
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
    </style>
</head>
<body>
    <div class="container">
        ${warningHtml}
        <div class="table-container">
            <table>
                ${headerHtml}
                ${bodyHtml}
            </table>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * 生成空状态 HTML
     */
    private getEmptyHtml(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV 表格视图</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 0;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        .empty {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="empty">CSV 文件为空或无法解析</div>
</body>
</html>`;
    }

    /**
     * HTML 转义
     */
    private escapeHtml(text: string): string {
        if (typeof text !== 'string') {
            return String(text);
        }
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m] || m);
    }

    /**
     * 解析并返回 Webview 内容
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // 设置 Webview 选项
        webviewPanel.webview.options = {
            enableScripts: false, // CSV 查看器不需要脚本
        };

        // 更新函数
        const updateWebview = () => {
            try {
                const text = document.getText();
                
                if (!text || text.trim().length === 0) {
                    webviewPanel.webview.html = this.getEmptyHtml();
                    return;
                }
                
                const isTruncated = text.length > CsvEditorProvider.MAX_FILE_SIZE;
                const csvData = this.parseCsv(text);
                webviewPanel.webview.html = this.getHtmlForWebview(csvData, isTruncated);
            } catch (error) {
                console.error('[CSV Editor] 错误:', error);
                webviewPanel.webview.html = this.getErrorHtml(String(error));
            }
        };

        // 监听文档变化
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        // 清理订阅
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        // 初始更新
        updateWebview();
    }

    /**
     * 生成错误页面 HTML
     */
    private getErrorHtml(errorMessage: string): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV 表格视图 - 错误</title>
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
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>无法加载 CSV 文件</h1>
        <p>错误信息：</p>
        <pre>${this.escapeHtml(errorMessage)}</pre>
    </div>
</body>
</html>`;
    }
}
