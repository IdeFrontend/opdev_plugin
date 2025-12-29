import * as vscode from 'vscode';

/** 最大渲染行数 */
const MAX_RENDER_ROWS = 1000;

/**
 * CSV 编辑器提供者 - 负责将 CSV 文件渲染为表格
 */
export class CsvEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'csvViewer';

    /**
     * 解析 CSV 文本为二维数组
     * 支持 RFC 4180 标准 CSV 格式
     */
    private parseCsv(text: string): string[][] {
        try {
            const rows: string[][] = [];
            
            if (!text || text.trim().length === 0) {
                return rows;
            }
            
            // 简化解析逻辑，使用更可靠的方法
            const lines: string[] = [];
            let currentLine = '';
            let inQuotes = false;
            
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const nextChar = i + 1 < text.length ? text[i + 1] : null;
                
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
                    // 行结束
                    if (char === '\r' && nextChar === '\n') {
                        i++; // 跳过 \n
                    }
                    if (currentLine.trim() || lines.length === 0) {
                        lines.push(currentLine);
                    }
                    currentLine = '';
                } else {
                    currentLine += char;
                }
            }
            
            // 添加最后一行
            if (currentLine.trim() || lines.length === 0) {
                lines.push(currentLine);
            }
            
            // 解析每行为字段数组
            for (const line of lines) {
                if (!line.trim() && rows.length > 0) {
                    continue; // 跳过空行（除了第一行）
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
                            i++; // 跳过下一个引号
                        } else {
                            fieldInQuotes = !fieldInQuotes;
                        }
                    } else if (char === ',' && !fieldInQuotes) {
                        fields.push(currentField);
                        currentField = '';
                    } else {
                        currentField += char;
                    }
                }
                
                // 添加最后一个字段
                fields.push(currentField);
                rows.push(fields);
            }
            
            return rows;
        } catch (error) {
            console.error('CSV 解析错误:', error);
            // 返回空数组或单行错误信息
            return [['解析错误', String(error)]];
        }
    }

    /**
     * 生成 HTML 内容
     */
    private getHtmlForWebview(csvData: string[][]): string {
        const displayRows = csvData.slice(0, MAX_RENDER_ROWS);
        const isOverMaxRows = csvData.length > MAX_RENDER_ROWS;

        // 生成表头
        let headerHtml = '';
        if (displayRows.length > 0) {
            headerHtml = '<thead><tr>';
            const headerRow = displayRows[0];
            for (const cell of headerRow) {
                headerHtml += `<th>${this.escapeHtml(cell)}</th>`;
            }
            headerHtml += '</tr></thead>';
        }

        // 生成表体
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
        <span>共 ${csvData.length} 行${isOverMaxRows ? `，仅显示前${MAX_RENDER_ROWS}行` : ''}</span>
        <div class="table-container">
            ${displayRows.length > 0 ? `<table>
                ${headerHtml}
                ${bodyHtml}
            </table>` : '<div class="empty">CSV 文件为空</div>'}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * HTML 转义
     */
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    /**
     * 解析并返回 Webview 内容
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        try {
            // 设置 Webview 选项
            webviewPanel.webview.options = {
                enableScripts: true,
            };

            // 初始化内容
            const updateWebview = () => {
                try {
                    const text = document.getText();
                    const csvData = this.parseCsv(text);
                    webviewPanel.webview.html = this.getHtmlForWebview(csvData);
                } catch (error) {
                    console.error('更新 Webview 错误:', error);
                    // 显示错误页面
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
        } catch (error) {
            console.error('初始化 CSV 编辑器错误:', error);
            webviewPanel.webview.html = this.getErrorHtml(String(error));
        }
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

