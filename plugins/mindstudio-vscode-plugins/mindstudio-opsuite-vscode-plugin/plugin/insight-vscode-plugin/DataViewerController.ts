/**
 * 数据查看器控制器
 * 负责管理多个 iframe 的加载和渲染
 */

interface IframeData {
    content: string;
    filePath?: string;
}

interface VSCodeAPI {
    postMessage(message: any): void;
}

interface WebviewMessage {
    command?: string;
    type?: string;
    pluginName?: string;
    content?: string;
    iframes?: Array<{
        pluginName: string;
        content: string;
        filePath?: string;
    }>;
    wsPort?: number;
    binPath?: string;
    data?: string;
    id?: string;
    reason?: string;
}

export class DataViewerController {
    private vscode: VSCodeAPI;
    
    // iframe 状态管理
    private iframeStatus = {
        // 期望的 iframe 列表
        expectedIframes: [
            'Communication', 'Summary', 'Cache', 'Detail', 'Source',
            'Compute', 'leaks', 'Memory', 'Operator', 'RL', 'Statistic', 'Timeline'
        ],
        // 已收到的 iframe 内容缓存
        receivedIframes: new Map<string, IframeData>(),
        // 已加载的 iframe 集合（避免重复加载）
        loadedIframes: new Set<string>(),
        // 是否已发送请求
        requestSent: false,
        // 轮询定时器
        pollTimer: null as number | null,
        // 轮询间隔（毫秒）
        pollInterval: 100
    };

    // 单个 div 的轮询定时器映射（key: pluginName/id, value: timerId）
    private divPollTimers = new Map<string, number>();

    private observer: MutationObserver | null = null;

    constructor(vscode: VSCodeAPI) {
        this.vscode = vscode;
        this.init();
    }

    /**
     * 初始化控制器
     */
    private init(): void {
        console.log('[Webview] ========== Webview 初始化完成 ==========');
        
        // 监听来自扩展的消息
        window.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });

        // 页面加载完成后检测 div 是否加载成功
        window.addEventListener('DOMContentLoaded', () => {
            this.onDOMContentLoaded();
        });

        // 如果 DOMContentLoaded 已经触发，立即检测
        if (document.readyState === 'loading') {
            console.log('[Webview] 文档状态: loading，等待 DOMContentLoaded 事件');
        } else {
            console.log('[Webview] ========== 文档已加载完成 ==========');
            console.log(`[Webview] 文档状态: ${document.readyState}`);
            this.onDOMContentLoaded();
        }

        // 使用 MutationObserver 监听 DOM 变化
        this.initMutationObserver();

        // 页面卸载时清理定时器
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * DOMContentLoaded 事件处理
     */
    private onDOMContentLoaded(): void {
        console.log('[Webview] ========== DOMContentLoaded 事件触发 ==========');
        // 通知扩展已准备好接收消息
        this.vscode.postMessage({ command: 'ready' });
        console.log('[Webview] ✓ 已发送 ready 消息到 node 端');
        
        // 检测 div 是否加载成功
        this.checkDivsLoaded();
    }

    /**
     * 初始化 MutationObserver
     */
    private initMutationObserver(): void {
        console.log('[Webview] 初始化 MutationObserver 监听 DOM 变化');
        this.observer = new MutationObserver((mutations) => {
            // 只在有实际变化时才检测，避免频繁调用
            const hasRelevantChanges = mutations.some(mutation => {
                return mutation.type === 'childList' && mutation.addedNodes.length > 0;
            });
            if (hasRelevantChanges && !this.iframeStatus.requestSent) {
                console.log('[Webview] 检测到 DOM 变化，重新检测 div 状态');
                this.checkDivsLoaded();
            }
        });

        // 观察整个文档的变化
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        console.log('[Webview] ✓ MutationObserver 已启动');
    }

    /**
     * 创建空的 iframe
     */
    private createIframe(pluginName: string): HTMLIFrameElement | null {
        const container = document.getElementById(pluginName);
        if (!container) {
            console.error(`未找到插件容器: ${pluginName}`);
            return null;
        }

        // 清除占位符
        container.innerHTML = '';

        // 创建空的 iframe
        const iframe = document.createElement('iframe');
        iframe.src = 'about:blank';
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.border = 'none';
        iframe.style.display = 'block';

        container.appendChild(iframe);
        return iframe;
    }

    /**
     * 渲染 iframe 内容
     */
    private renderIframeContent(pluginName: string, content: string): void {
        console.log(`[Webview] [${pluginName}] ========== 开始渲染 iframe ==========`);
        const renderStartTime = Date.now();

        const container = document.getElementById(pluginName);
        if (!container) {
            console.error(`[Webview] [${pluginName}] ✗ 未找到插件容器`);
            return;
        }

        // 获取或创建 iframe
        let iframe: HTMLIFrameElement | null = container.querySelector('iframe') as HTMLIFrameElement | null;
        if (!iframe) {
            console.log(`[Webview] [${pluginName}] 创建新的 iframe 元素`);
            iframe = this.createIframe(pluginName);
            if (!iframe) {
                return;
            }
        } else {
            console.log(`[Webview] [${pluginName}] 使用已存在的 iframe 元素`);
        }

        // 尝试写入内容的函数
        const writeContent = (): void => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc) {
                    console.error(`[Webview] [${pluginName}] ✗ 无法获取 iframe document`);
                    return;
                }

                const writeStartTime = Date.now();
                doc.open();
                doc.write(content);
                doc.close();
                const writeEndTime = Date.now();

                const renderEndTime = Date.now();
                const totalTime = renderEndTime - renderStartTime;
                console.log(`[Webview] [${pluginName}] ✓ 成功渲染 iframe，写入耗时: ${writeEndTime - writeStartTime}ms，总耗时: ${totalTime}ms`);
            } catch (error) {
                console.error(`[Webview] [${pluginName}] ✗ 渲染 iframe 内容失败:`, error);
                container.innerHTML = `<div class="plugin-placeholder">渲染失败: ${pluginName}</div>`;
            }
        };

        // 如果 iframe 已经加载，直接写入
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc && doc.readyState === 'complete') {
                console.log(`[Webview] [${pluginName}] iframe 已就绪，直接写入内容`);
                writeContent();
            } else {
                console.log(`[Webview] [${pluginName}] iframe 未就绪，等待加载完成 (readyState: ${doc ? doc.readyState : 'N/A'})`);
                // 等待 iframe 加载完成后再写入内容
                iframe.onload = () => {
                    console.log(`[Webview] [${pluginName}] iframe onload 事件触发`);
                    writeContent();
                };
                // 如果 onload 没有触发，使用 setTimeout 重试
                setTimeout(() => {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (doc && doc.readyState === 'complete') {
                        console.log(`[Webview] [${pluginName}] setTimeout 检测到 iframe 已就绪`);
                        writeContent();
                    } else {
                        console.warn(`[Webview] [${pluginName}] setTimeout 检测到 iframe 仍未就绪`);
                    }
                }, 100);
            }
        } catch (error) {
            console.warn(`[Webview] [${pluginName}] 访问 iframe document 失败，等待 onload:`, error);
            // 如果访问 document 失败，等待 onload
            iframe.onload = () => {
                console.log(`[Webview] [${pluginName}] iframe onload 事件触发（异常路径）`);
                writeContent();
            };
        }
    }

    /**
     * 检查并加载已收到的 iframe 内容
     */
    private checkAndLoadIframes(): void {
        let checkedCount = 0;
        let loadedCount = 0;
        let skippedCount = 0;

        this.iframeStatus.expectedIframes.forEach(pluginName => {
            checkedCount++;
            // 如果已收到内容但还未加载
            if (this.iframeStatus.receivedIframes.has(pluginName) && !this.iframeStatus.loadedIframes.has(pluginName)) {
                const iframeData = this.iframeStatus.receivedIframes.get(pluginName)!;
                // 检查容器是否存在
                const container = document.getElementById(pluginName);
                if (container) {
                    console.log(`[Webview] [${pluginName}] ✓ 开始加载 iframe 内容，文件路径: ${iframeData.filePath || 'N/A'}`);
                    this.renderIframeContent(pluginName, iframeData.content);
                    // 标记为已加载
                    this.iframeStatus.loadedIframes.add(pluginName);
                    loadedCount++;
                } else {
                    console.warn(`[Webview] [${pluginName}] ✗ 容器不存在，无法加载`);
                }
            } else if (this.iframeStatus.loadedIframes.has(pluginName)) {
                skippedCount++;
            }
        });

        if (loadedCount > 0) {
            console.log(`[Webview] 本次检查: 检查 ${checkedCount} 个，加载 ${loadedCount} 个，跳过 ${skippedCount} 个`);
        }
    }

    /**
     * 开始轮询等待 iframe 内容
     */
    private startPolling(): void {
        if (this.iframeStatus.pollTimer) {
            console.log('[Webview] 轮询已在运行中，跳过重复启动');
            return; // 已经在轮询中
        }

        console.log(`[Webview] ========== 开始轮询等待 iframe 内容 ==========`);
        console.log(`[Webview] 轮询间隔: ${this.iframeStatus.pollInterval}ms`);
        console.log(`[Webview] 期望的 iframe 数量: ${this.iframeStatus.expectedIframes.length}`);
        console.log(`[Webview] 已缓存的 iframe 数量: ${this.iframeStatus.receivedIframes.size}`);
        console.log(`[Webview] 已加载的 iframe 数量: ${this.iframeStatus.loadedIframes.size}`);

        let pollCount = 0;
        this.iframeStatus.pollTimer = window.setInterval(() => {
            pollCount++;
            if (pollCount % 10 === 0) {
                // 每10次轮询输出一次状态
                const cachedList = Array.from(this.iframeStatus.receivedIframes.keys()).join(', ');
                const loadedList = Array.from(this.iframeStatus.loadedIframes.keys()).join(', ');
                console.log(`[Webview] 轮询第 ${pollCount} 次 - 已缓存: [${cachedList}], 已加载: [${loadedList}]`);
            }

            this.checkAndLoadIframes();

            // 如果所有 iframe 都已加载，停止轮询
            const allLoaded = this.iframeStatus.expectedIframes.every(pluginName => {
                return this.iframeStatus.loadedIframes.has(pluginName);
            });

            if (allLoaded) {
                console.log(`[Webview] ========== 所有 iframe 已加载完成，停止轮询 ==========`);
                console.log(`[Webview] 总轮询次数: ${pollCount}`);
                console.log(`[Webview] 已加载的 iframe: [${Array.from(this.iframeStatus.loadedIframes.keys()).join(', ')}]`);
                this.stopPolling();
            }
        }, this.iframeStatus.pollInterval);
    }

    /**
     * 停止轮询
     */
    private stopPolling(): void {
        if (this.iframeStatus.pollTimer) {
            console.log('[Webview] 停止轮询定时器');
            clearInterval(this.iframeStatus.pollTimer);
            this.iframeStatus.pollTimer = null;
        } else {
            console.log('[Webview] 轮询定时器不存在，无需停止');
        }
    }

    /**
     * 检测 div 是否加载成功
     */
    private checkDivsLoaded(): void {
        const loadedDivs: string[] = [];
        const missingDivs: string[] = [];

        this.iframeStatus.expectedIframes.forEach(pluginName => {
            const container = document.getElementById(pluginName);
            if (container) {
                loadedDivs.push(pluginName);
            } else {
                missingDivs.push(pluginName);
            }
        });

        const allDivsLoaded = missingDivs.length === 0;

        console.log(`[Webview] 检测 div 状态 - 已加载: ${loadedDivs.length}/${this.iframeStatus.expectedIframes.length}`);
        if (loadedDivs.length > 0) {
            console.log(`[Webview] 已加载的 div: [${loadedDivs.join(', ')}]`);
        }
        if (missingDivs.length > 0) {
            console.log(`[Webview] 缺失的 div: [${missingDivs.join(', ')}]`);
        }

        if (allDivsLoaded && !this.iframeStatus.requestSent) {
            console.log('[Webview] ========== 所有 div 已加载成功 ==========');
            console.log(`[Webview] 当前缓存状态: ${this.iframeStatus.receivedIframes.size}/${this.iframeStatus.expectedIframes.length} 个 iframe 已缓存`);
            console.log('[Webview] 开始轮询本地缓存...');
            this.iframeStatus.requestSent = true;
            // 直接开始轮询本地缓存，不需要请求 node 端
            this.startPolling();
        } else if (!allDivsLoaded) {
            console.log(`[Webview] 等待更多 div 加载... (${loadedDivs.length}/${this.iframeStatus.expectedIframes.length})`);
        } else if (this.iframeStatus.requestSent) {
            console.log('[Webview] 轮询已启动，跳过重复检测');
        }
    }

    /**
     * 处理来自扩展的消息
     */
    private handleMessage(message: WebviewMessage): void {
        // 处理统一发送所有 iframe 内容的消息
        if (message.command === 'renderAllIframes') {
            this.handleRenderAllIframes(message);
            return;
        }

        // 处理设置 bin 文件路径的消息（保留兼容性）
        if (message.command === 'setBinPath') {
            const binPathElement = document.getElementById('binPath');
            if (binPathElement && message.data) {
                binPathElement.textContent = message.data;
            }
            return;
        }

        // 处理设置 WebSocket 端口的消息（保留兼容性）
        if (message.command === 'setWsPort') {
            const wsPortElement = document.getElementById('wsPort');
            if (wsPortElement && message.data) {
                wsPortElement.textContent = message.data;
            }
            return;
        }

        // 处理单个 iframe 内容渲染消息（保留兼容性）
        if (message.command === 'renderIframe') {
            if (message.pluginName && message.content) {
                this.renderIframeContent(message.pluginName, message.content);
            } else {
                console.error('renderIframe 消息缺少必要字段:', message);
            }
            return;
        }

        // 处理 WebSocket 桥接消息（来自 NodeWebviewSocketBridge）
        if (message.type && message.type.startsWith('ws:')) {
            this.handleWebSocketMessage(message);
            return;
        }
    }

    /**
     * 处理 renderAllIframes 消息
     */
    private handleRenderAllIframes(message: WebviewMessage): void {
        console.log('[Webview] ========== 收到 renderAllIframes 消息 ==========');

        // 打印文件地址到控制台
        if (message.binPath) {
            console.log(`[Webview] BIN 文件路径: ${message.binPath}`);
        }
        if (message.wsPort) {
            console.log(`[Webview] WebSocket 端口: ${message.wsPort}`);
        }

        // 更新页面显示的 binPath 和 wsPort
        const binPathElement = document.getElementById('binPath');
        if (binPathElement && message.binPath) {
            binPathElement.textContent = message.binPath;
            console.log('[Webview] ✓ 已更新页面显示的 binPath');
        }

        const wsPortElement = document.getElementById('wsPort');
        if (wsPortElement && message.wsPort) {
            wsPortElement.textContent = String(message.wsPort);
            console.log('[Webview] ✓ 已更新页面显示的 wsPort');
        }

        // 将接收到的 iframe 内容存储到缓存中
        if (message.iframes && Array.isArray(message.iframes)) {
            console.log(`[Webview] 接收到 ${message.iframes.length} 个 iframe 内容，开始缓存...`);
            const cacheStartTime = Date.now();

            message.iframes.forEach((iframe) => {
                if (iframe.pluginName && iframe.content) {
                    const contentSize = iframe.content.length;
                    console.log(`[Webview] [${iframe.pluginName}] ✓ 缓存成功，内容大小: ${contentSize} 字节，文件路径: ${iframe.filePath || 'N/A'}`);
                    // 存储到缓存中
                    this.iframeStatus.receivedIframes.set(iframe.pluginName, {
                        content: iframe.content,
                        filePath: iframe.filePath
                    });
                } else {
                    console.warn(`[Webview] ✗ 跳过无效的 iframe 数据:`, iframe);
                }
            });

            const cacheEndTime = Date.now();
            console.log(`[Webview] ✓ 缓存完成，耗时: ${cacheEndTime - cacheStartTime}ms`);
            console.log(`[Webview] 当前缓存状态: ${this.iframeStatus.receivedIframes.size}/${this.iframeStatus.expectedIframes.length} 个 iframe 已缓存`);
            console.log(`[Webview] 已缓存的 iframe: [${Array.from(this.iframeStatus.receivedIframes.keys()).join(', ')}]`);

            // 如果 div 已经加载，立即尝试加载已收到的内容
            // 如果 div 还未加载，等待轮询机制处理
            if (this.iframeStatus.requestSent) {
                console.log('[Webview] Div 已加载，立即尝试加载已缓存的 iframe 内容');
                this.checkAndLoadIframes();
            } else {
                console.log('[Webview] Div 尚未加载，等待 div 加载后轮询加载');
            }
        } else {
            console.warn('[Webview] ✗ 消息中没有 iframes 数组或格式不正确');
        }

        console.log('[Webview] ========== renderAllIframes 消息处理完成 ==========');
    }

    /**
     * 处理 WebSocket 桥接消息
     */
    private handleWebSocketMessage(message: WebviewMessage): void {
        // WebSocket 桥接消息处理
        // 这些消息来自 NodeWebviewSocketBridge，用于 WebSocket 通信
        switch (message.type) {
            case 'ws:opened':
                break;
            case 'ws:message':
                break;
            case 'ws:error':
                console.error('WebSocket error:', message.id, message.reason);
                break;
            case 'ws:closed':
                break;
        }
    }

    /**
     * 清理资源
     */
    private cleanup(): void {
        console.log('[Webview] 页面即将卸载，清理资源');
        this.stopPolling();
        
        // 清理所有 div 的轮询定时器
        this.divPollTimers.forEach((timerId, pluginName) => {
            console.log(`[Webview] [${pluginName}] 清理轮询定时器`);
            clearInterval(timerId);
        });
        this.divPollTimers.clear();
        
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    /**
     * 公开方法：打开 WebSocket 连接（示例）
     */
    public openWebSocket(id: string, url: string, protocols: string[] = []): void {
        this.vscode.postMessage({
            type: 'ws:open',
            id,
            url,
            protocols
        });
    }

    /**
     * 公开方法：div onload 事件处理
     * 根据 div 的 id 匹配 iframe 缓存数据并渲染
     * 如果数据还未返回，则轮询本地存储等待数据到达
     * 
     * @param id div 的 id，应该与 pluginName 匹配
     */
    public onDivLoad(id: string): void {
        console.log(`[Webview] [${id}] ========== div onload 事件触发 ==========`);

        // 检查容器是否存在
        const container = document.getElementById(id);
        if (!container) {
            console.error(`[Webview] [${id}] ✗ 未找到容器元素`);
            return;
        }

        // 检查容器中是否实际存在iframe元素
        const existingIframe = container.querySelector('iframe') as HTMLIFrameElement | null;
        let shouldSkipLoad = false;

        // 如果iframe存在，检查是否已经加载了内容（通过检查contentDocument的状态）
        if (existingIframe) {
            try {
                const doc = existingIframe.contentDocument || existingIframe.contentWindow?.document;
                // 如果iframe存在且有有效的document且有内容，说明已经加载过了
                if (doc && doc.readyState === 'complete' && doc.body && doc.body.innerHTML.trim().length > 0) {
                    console.log(`[Webview] [${id}] iframe已存在且已加载内容，跳过重复加载`);
                    // 确保标记为已加载（可能在重新渲染后丢失）
                    if (!this.iframeStatus.loadedIframes.has(id)) {
                        this.iframeStatus.loadedIframes.add(id);
                    }
                    shouldSkipLoad = true;
                } else {
                    // iframe存在但未加载内容或内容为空，需要重新加载
                    console.log(`[Webview] [${id}] iframe存在但未加载内容，需要重新加载`);
                }
            } catch (e) {
                // 跨域或其他错误，无法检查内容，但iframe存在，假设已加载
                console.log(`[Webview] [${id}] iframe已存在但无法检查内容状态（可能是跨域限制），跳过加载`);
                if (!this.iframeStatus.loadedIframes.has(id)) {
                    this.iframeStatus.loadedIframes.add(id);
                }
                shouldSkipLoad = true;
            }
        } else {
            // iframe不存在，如果之前标记为已加载，说明div被重新渲染了，需要清除标记
            if (this.iframeStatus.loadedIframes.has(id)) {
                console.log(`[Webview] [${id}] 检测到div被重新渲染，iframe已不存在，清除旧标记并重新加载`);
                this.iframeStatus.loadedIframes.delete(id);
            }
        }

        // 如果需要跳过加载，直接返回
        if (shouldSkipLoad) {
            return;
        }

        // 检查缓存中是否有数据
        if (this.iframeStatus.receivedIframes.has(id)) {
            const iframeData = this.iframeStatus.receivedIframes.get(id)!;
            console.log(`[Webview] [${id}] ✓ 缓存中已有数据，立即渲染，文件路径: ${iframeData.filePath || 'N/A'}`);
            this.renderIframeContent(id, iframeData.content);
            // 标记为已加载
            this.iframeStatus.loadedIframes.add(id);
            console.log(`[Webview] [${id}] ✓ 渲染完成`);
        } else {
            console.log(`[Webview] [${id}] 缓存中暂无数据，开始轮询等待...`);
            // 启动针对这个 id 的轮询
            this.startDivPolling(id);
        }
    }

    /**
     * 启动针对特定 div 的轮询
     * @param pluginName div 的 id/pluginName
     */
    private startDivPolling(pluginName: string): void {
        // 如果已经在轮询中，跳过
        if (this.divPollTimers.has(pluginName)) {
            console.log(`[Webview] [${pluginName}] 轮询已在运行中，跳过重复启动`);
            return;
        }

        console.log(`[Webview] [${pluginName}] ========== 开始轮询等待 iframe 内容 ==========`);
        console.log(`[Webview] [${pluginName}] 轮询间隔: ${this.iframeStatus.pollInterval}ms`);

        let pollCount = 0;
        const maxPollCount = 1000; // 最大轮询次数，避免无限轮询

        const timerId = window.setInterval(() => {
            pollCount++;

            // 检查缓存中是否有数据
            if (this.iframeStatus.receivedIframes.has(pluginName)) {
                const iframeData = this.iframeStatus.receivedIframes.get(pluginName)!;
                console.log(`[Webview] [${pluginName}] ✓ 轮询第 ${pollCount} 次，检测到数据，开始渲染，文件路径: ${iframeData.filePath || 'N/A'}`);
                
                // 停止轮询
                this.stopDivPolling(pluginName);
                
                // 渲染内容
                this.renderIframeContent(pluginName, iframeData.content);
                // 标记为已加载
                this.iframeStatus.loadedIframes.add(pluginName);
                console.log(`[Webview] [${pluginName}] ✓ 渲染完成`);
            } else if (pollCount >= maxPollCount) {
                // 达到最大轮询次数，停止轮询
                console.warn(`[Webview] [${pluginName}] ✗ 达到最大轮询次数 (${maxPollCount})，停止轮询`);
                this.stopDivPolling(pluginName);
            } else if (pollCount % 50 === 0) {
                // 每50次轮询输出一次状态
                console.log(`[Webview] [${pluginName}] 轮询第 ${pollCount} 次，仍在等待数据...`);
            }
        }, this.iframeStatus.pollInterval);

        // 保存定时器 ID
        this.divPollTimers.set(pluginName, timerId);
    }

    /**
     * 停止特定 div 的轮询
     * @param pluginName div 的 id/pluginName
     */
    private stopDivPolling(pluginName: string): void {
        const timerId = this.divPollTimers.get(pluginName);
        if (timerId) {
            console.log(`[Webview] [${pluginName}] 停止轮询定时器`);
            clearInterval(timerId);
            this.divPollTimers.delete(pluginName);
        }
    }
}

// 在全局作用域中初始化控制器
declare global {
    interface Window {
        acquireVsCodeApi: () => VSCodeAPI;
        DataViewerController: typeof DataViewerController;
    }
}

// 导出到全局，以便在 HTML 中使用
if (typeof window !== 'undefined') {
    window.DataViewerController = DataViewerController;
    
    // 如果 acquireVsCodeApi 可用，自动初始化
    if (window.acquireVsCodeApi) {
        const vscode = window.acquireVsCodeApi();
        const controller = new DataViewerController(vscode);
        // 将控制器暴露到全局，以便调试
        (window as any).dataViewerController = controller;
    }
}

