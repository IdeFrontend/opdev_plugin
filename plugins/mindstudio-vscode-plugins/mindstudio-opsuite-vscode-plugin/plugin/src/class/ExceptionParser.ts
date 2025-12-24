export interface Result {
    // 问题名称
    title: string;
    // 异常名（原始异常名称，如 "illegal read of size 224"）
    exceptionName: string;
    //错误类型
    type: string;  // error warning 提示
    //问题类型
    questionType: QuestionType;
    // 问题描述
    question: string;
    // 问题详情（完整的错误内容块）
    originData: string;
    // 源码文件
    fileLink?: string;
    // 行数
    row?: number;
    // 列数
    col?: number;
}

// 问题大类
export type QuestionType = 'memory' | 'memoryContention' | 'uninitialized' | 'synchronize';

export const exceptionTpyeMap = new Map<string, string>([
    // 注意：顺序很重要，更具体的匹配应该放在前面
    ['Potential RAW hazard detected', 'memoryContention'],
    ['Potential WAR hazard detected', 'memoryContention'],
    ['Potential WAW hazard detected', 'memoryContention'],
    ['LeakCheck: detected memory leaks', 'memory'],
    ['illegal free()', 'memory'],
    ['illegal read of size', 'memory'],
    ['illegal write of size', 'memory'],
    ['out of bounds of size', 'memory'],
    ['Unused memory', 'memory'],
    ['misaligned access of size', 'memory'],
    ['uninitialized read of size', 'uninitialized'],
    ['Unpaired set_flag insetructions detected', 'synchronize'],
]);

export const exceptionMap = new Map<string, string>([
    // 注意：顺序很重要，更具体的匹配应该放在前面
    ['memory', '内存'],
    ['memoryContention', '竞争'],
    ['uninitialized', '未初始化'],
    ['synchronize', '同步'],
]);

/**
 * 异常名到中文的映射表
 * key: 异常名关键字（支持部分匹配）
 * value: 中文异常名
 */
export const exceptionNameMap = new Map<string, string>([
    // 注意：顺序很重要，更具体的匹配应该放在前面
    ['Potential RAW hazard detected', '(Reaqd-After-White)内存数据竞争访问'],
    ['Potential WAR hazard detected', '(White-After-Read)内存数据竞争访问'],
    ['Potential WAW hazard detected', '(White-After-White)内存数据竞争访问'],
    ['LeakCheck: detected memory leaks', '内存泄漏'],
    ['illegal free()', '非法释放'],
    ['illegal read of size', '非法读'],
    ['illegal write of size', '非法写'],
    ['out of bounds of size', '多核踩踏'],
    ['Unused memory', '分配内存未使用'],
    ['uninitialized read of size', '未初始化异常'],
    ['Unpaired set_flag insetructions detected', '同步异常'],
    ['misaligned access of size', '非对齐访问'],
]);

/**
 * 根据异常名获取问题类型
 * @param exceptionName 原始异常名
 * @returns 问题类型，如果没有匹配则返回 null
 */
export function getQuestionTypeByExceptionName(exceptionName: string): string | null {
    if (!exceptionName || exceptionName.trim() === '') {
        return null;
    }

    const trimmedName = exceptionName.trim();
    const lowerTrimmedName = trimmedName.toLowerCase();

    // 按键的长度从长到短排序，优先匹配更具体的键
    const sortedEntries = Array.from(exceptionTpyeMap.entries())
        .sort((a, b) => b[0].length - a[0].length);

    // 部分匹配：如果异常名包含映射键，则使用该映射（大小写敏感）
    for (const [key, value] of sortedEntries) {
        if (trimmedName.includes(key)) {
            return value;
        }
    }

    // 大小写不敏感匹配：如果异常名包含映射键（忽略大小写），则使用该映射
    for (const [key, value] of sortedEntries) {
        const lowerKey = key.toLowerCase();
        if (lowerTrimmedName.includes(lowerKey)) {
            return value;
        }
    }

    return null;
}

/**
 * 根据问题类型获取中文
 * @param questionType 问题类型
 * @returns 中文问题类型，如果没有匹配则返回原始问题类型
 */
export function getChineseQuestionType(questionType: string): string {
    if (!questionType || questionType.trim() === '') {
        return questionType;
    }

    return exceptionMap.get(questionType) || questionType;
}

/**
 * 根据异常名获取中文映射
 * @param exceptionName 原始异常名
 * @returns 中文异常名，如果没有匹配则返回原始异常名
 */
export function getChineseExceptionName(exceptionName: string): string {
    if (!exceptionName || exceptionName.trim() === '') {
        return exceptionName;
    }

    const trimmedName = exceptionName.trim();
    const lowerTrimmedName = trimmedName.toLowerCase();

    // 1. 首先尝试精确匹配（大小写敏感）
    if (exceptionNameMap.has(trimmedName)) {
        return exceptionNameMap.get(trimmedName)!;
    }

    // 2. 按键的长度从长到短排序，优先匹配更具体的键
    const sortedEntries = Array.from(exceptionNameMap.entries())
        .sort((a, b) => b[0].length - a[0].length);

    // 3. 部分匹配：如果异常名包含映射键，则使用该映射（大小写敏感）
    for (const [key, value] of sortedEntries) {
        if (trimmedName.includes(key)) {
            return value;
        }
    }

    // 4. 大小写不敏感匹配：如果异常名包含映射键（忽略大小写），则使用该映射
    for (const [key, value] of sortedEntries) {
        const lowerKey = key.toLowerCase();
        if (lowerTrimmedName.includes(lowerKey)) {
            return value;
        }
    }

    // 5. 如果没有找到匹配，返回原始异常名
    return trimmedName;
}
/**
 * 需要处理的异常类型列表（对应 result.ts 中 ignoredKeys 的键）
 * 只处理这些类型的异常
 */
const SUPPORTED_EXCEPTION_PATTERNS = [
    { pattern: 'Potential RAW hazard detected', type: 'memoryContention', errorType: 'error' },
    { pattern: 'Potential WAR hazard detected', type: 'memoryContention', errorType: 'error' },
    { pattern: 'Potential WAW hazard detected', type: 'memoryContention', errorType: 'error' },
    { pattern: 'LeakCheck: detected memory leaks', type: 'memory', errorType: 'error' },
    { pattern: 'illegal free()', type: 'memory', errorType: 'error' },
    { pattern: 'illegal read of size', type: 'memory', errorType: 'error' },
    { pattern: 'illegal write of size', type: 'memory', errorType: 'error' },
    { pattern: 'out of bounds of size', type: 'memory', errorType: 'warning' },
    { pattern: 'Unused memory', type: 'memory', errorType: 'warning' },
    { pattern: 'uninitialized read of size', type: 'uninitialized', errorType: 'error' },
    { pattern: 'Unpaired set_flag insetructions detected', type: 'synchronize', errorType: 'warning' },
    { pattern: 'misaligned access of size', type: 'memory', errorType: 'error' },
] as const;

/**
 * 异常检测结果解析器 V2
 * 专门处理以 ====== 开头的命令行输出格式
 * 支持流式输入，逐行解析异常检测工具的输出
 * 只处理 result.ts 中 ignoredKeys 列出的异常类型
 */
export class ExceptionParser {
    private results: Result[] = [];
    private currentResult: Partial<Result> | null = null;
    private buffer: string[] = []; // 清理后的行（用于解析）
    private rawBuffer: string[] = []; // 原始行（保留 ====== 前缀，用于问题详情）
    private currentQuestionType: QuestionType | null = null;
    private isInContentionEvent: boolean = false; // 标记是否在处理竞争检测事件
    private currentStackLevel: number = -1; // 当前结果的最大调用栈层级

    /**
     * 处理一行输入
     * @param line 控制台输出的一行文本（可能包含 ====== 前缀）
     */
    public processLine(line: string): void {
        // 保存原始行（用于问题详情）
        const originalLine = line.trim();

        // 检查是否为空行（完全没有内容，包括没有 ====== 前缀）
        if (!originalLine) {
            // 空行：如果当前有异常在处理，结束它
            if (this.currentResult) {
                this.finalizeCurrentResult();
            }
            return;
        }

        // 移除行首的 ====== 前缀和前后空白
        const cleanedLine = this.cleanLine(line);

        // 检查是否为SUMMARY行（异常块的结束标记）
        if (cleanedLine && cleanedLine.startsWith('SUMMARY:')) {
            // SUMMARY行：结束当前异常（但不包含SUMMARY行）
            if (this.currentResult) {
                this.finalizeCurrentResult();
            }
            return;
        }

        if (!cleanedLine) {
            // 如果清理后为空，但原始行不为空（比如只有 ======），仍然收集
            if (this.currentResult) {
                this.collectExceptionInfo('', originalLine);
            }
            return;
        }

        // 检测异常类型和开始标记
        // 先保存之前的异常结果（如果有）
        const previousResult = this.currentResult;
        // 检测新异常（这会设置新的 currentResult）
        const isNewException = this.detectExceptionStart(cleanedLine);

        if (isNewException) {
            // 保存新异常的结果（detectExceptionStart 已经设置了）
            const newResult = this.currentResult;
            // 恢复之前的异常结果，然后保存它
            this.currentResult = previousResult;
            this.finalizeCurrentResult();
            // 恢复新异常的结果
            this.currentResult = newResult;
            // 初始化 buffer
            this.startNewResult(cleanedLine, originalLine);
        } else if (this.currentResult) {
            // 收集异常详细信息（同时保存原始行）
            this.collectExceptionInfo(cleanedLine, originalLine);
        }
    }

    /**
     * 清理行内容：移除 ====== 前缀和前后空白
     */
    private cleanLine(line: string): string {
        let cleaned = line.trim();
        // 移除行首的 ====== 前缀
        if (cleaned.startsWith('======')) {
            cleaned = cleaned.substring(6).trim();
        }
        return cleaned;
    }

    /**
     * 提取异常名（从 ERROR: 或 WARNING: 后面提取）
     */
    private extractExceptionName(line: string): string {
        // 匹配 ERROR: 或 WARNING: 后面的内容
        const match = line.match(/^(?:ERROR|WARNING):\s*(.+?)(?:\s+at\s|$)/);
        if (match && match[1]) {
            return match[1].trim();
        }
        // 如果没有匹配到，尝试提取 ERROR: 或 WARNING: 后面的所有内容
        const simpleMatch = line.match(/^(?:ERROR|WARNING):\s*(.+)/);
        if (simpleMatch && simpleMatch[1]) {
            return simpleMatch[1].trim();
        }
        return '';
    }

    /**
     * 检测异常开始标记
     * 只处理 SUPPORTED_EXCEPTION_PATTERNS 中定义的异常类型（对应 result.ts 中 ignoredKeys 的键）
     */
    private detectExceptionStart(line: string): boolean {
        // 提取异常名
        const exceptionName = this.extractExceptionName(line);

        // 遍历支持的异常模式，按顺序匹配（更具体的模式应该放在前面）
        for (const pattern of SUPPORTED_EXCEPTION_PATTERNS) {
            // 检查行中是否包含该模式
            // 先检查是否有正确的前缀（ERROR: 或 WARNING:），然后检查是否包含模式字符串
            const hasErrorPrefix = line.includes('ERROR:');
            const hasWarningPrefix = line.includes('WARNING:');
            const hasCorrectPrefix = (pattern.errorType === 'error' && hasErrorPrefix) ||
                (pattern.errorType === 'warning' && hasWarningPrefix);

            // 如果行包含模式字符串（不区分大小写），并且有正确的前缀，则匹配成功
            const lineLower = line.toLowerCase();
            const patternLower = pattern.pattern.toLowerCase();
            if (lineLower.includes(patternLower) && hasCorrectPrefix) {
                // 根据异常名获取问题类型
                const questionType = getQuestionTypeByExceptionName(exceptionName) || pattern.type;

                // 根据问题类型获取中文
                const title = getChineseQuestionType(questionType);

                // 设置竞争检测事件标记
                if (questionType === 'memoryContention') {
                    this.isInContentionEvent = true;
                } else {
                    this.isInContentionEvent = false;
                }

                this.currentQuestionType = questionType as QuestionType;
                this.currentResult = {
                    type: pattern.errorType,
                    questionType: questionType as QuestionType,
                    title: title,
                    exceptionName: exceptionName,
                    question: exceptionName, // 问题描述取ERROR或WARNING后面的全部内容
                };

                return true;
            }
        }

        return false;
    }

    /**
     * 提取竞争类型
     */
    private extractHazardType(line: string): string {
        if (line.includes('RAW hazard')) return 'RAW (Read-After-Write)';
        if (line.includes('WAR hazard')) return 'WAR (Write-After-Read)';
        if (line.includes('WAW hazard')) return 'WAW (Write-After-Write)';
        return '未知类型';
    }

    /**
     * 收集异常详细信息
     */
    private collectExceptionInfo(line: string, originalLine: string): void {
        if (!this.currentResult) {
            return;
        }

        const trimmedLine = line.trim();

        // 收集问题描述（清理后的行用于解析）
        this.buffer.push(line);
        // 收集原始行（用于问题详情）
        this.rawBuffer.push(originalLine);

        // 解析调用栈信息（格式：#3 file/path.cpp:21:5）
        // 格式说明：#3 是调用栈层级，file/path.cpp 是文件路径，21 是行号，5 是列号
        // 只保存不包含环境变量（如 ${ASCEND_HOME_PATH}）的用户代码文件
        if (trimmedLine.startsWith('#')) {
            const stackMatch = line.match(/^\s*#(\d+)\s+(.+?):(\d+):(\d+)/);
            if (stackMatch) {
                const stackLevel = parseInt(stackMatch[1], 10); // 调用栈层级（0, 1, 2, 3...）
                const filePath = stackMatch[2].trim();
                const row = parseInt(stackMatch[3], 10);
                const col = parseInt(stackMatch[4], 10);

                // 只保存用户代码文件（排除包含环境变量的系统路径）
                // 包含 ${ASCEND_HOME_PATH} 的是系统调用栈，不是用户代码
                const isSystem = this.isSystemPath(filePath);

                if (!isSystem) {
                    // 提取文件名（去掉路径前缀）
                    // 例如：illegal_read_and_write/add_custom.cpp -> add_custom.cpp
                    const fileName = this.extractFileName(filePath);

                    // 优先选择调用栈中编号最大的用户代码文件（通常是 #3）
                    // 如果还没有设置文件信息，或者当前调用栈层级更高，则更新
                    if (!this.currentResult.fileLink ||
                        stackLevel > this.currentStackLevel) {
                        this.currentResult.fileLink = filePath;
                        this.currentResult.row = row;
                        this.currentResult.col = col;
                        // 更新当前最大调用栈层级
                        this.currentStackLevel = stackLevel;
                    }
                }
            } else {
                // 如果行以 # 开头但没有匹配到格式，尝试更宽松的匹配
                // 例如：#3 file.cpp:21 或 #3 file.cpp:21:5
                const looseMatch = line.match(/^\s*#(\d+)\s+(.+?):(\d+)(?::(\d+))?/);
                if (looseMatch) {
                    const stackLevel = parseInt(looseMatch[1], 10);
                    const filePath = looseMatch[2].trim();
                    const row = parseInt(looseMatch[3], 10);
                    const col = looseMatch[4] ? parseInt(looseMatch[4], 10) : 0;
                    
                    if (!this.isSystemPath(filePath)) {
                        const fileName = this.extractFileName(filePath);
                        if (!this.currentResult.fileLink ||
                            stackLevel > this.currentStackLevel) {
                                console.log('aaaaaaaaaaaaaaa', filePath)
                            this.currentResult.fileLink = fileName;
                            this.currentResult.row = row;
                            this.currentResult.col = col;
                            this.currentStackLevel = stackLevel;
                        }
                    }
                }
            }
        }

        // 注意：问题描述（question）已经在 detectExceptionStart 中设置为 ERROR 或 WARNING 后面的全部内容
        // 以下代码不再覆盖 question，只用于提取其他信息（如文件路径、行号等）

        // 解析代码定位信息（格式：code in file.cpp:84）
        if (line.includes('code in') && line.includes('.cpp:')) {
            const codeMatch = line.match(/code\s+in\s+(.+?):(\d+)/);
            if (codeMatch && !this.currentResult.fileLink) {
                console.log('bbbbbbbbbbbbbbbb', codeMatch)
                this.currentResult.fileLink = codeMatch[1].trim();
                this.currentResult.row = parseInt(codeMatch[2], 10);
            }
        }
    }

    /**
     * 判断是否为系统路径
     * 包含 ${ASCEND_HOME_PATH} 环境变量的路径是系统调用栈，不是用户代码
     */
    private isSystemPath(filePath: string): boolean {
        // 包含环境变量的路径是系统路径
        const hasEnvVar = filePath.includes('${ASCEND_HOME_PATH}');
        if (hasEnvVar) {
            return true;
        }
        // 其他系统路径特征
        return filePath.includes('/compiler/') ||
            filePath.includes('/tikcpp/') ||
            filePath.includes('kernel_operator_data_copy_impl.h') ||
            filePath.includes('inner_kernel_operator_data_copy_intf.cppm') ||
            filePath.includes('kernel_event.h') ||
            filePath.includes('kernel_common.h');
    }

    /**
     * 从文件路径中提取文件名
     * 例如：illegal_read_and_write/add_custom.cpp -> add_custom.cpp
     *      out_of_bound/add_custom.cpp -> add_custom.cpp
     */
    private extractFileName(filePath: string): string {
        // 使用 / 或 \ 分割路径，取最后一部分作为文件名
        const parts = filePath.split(/[/\\]/);
        const fileName = parts[parts.length - 1] || filePath;
        return fileName;
    }

    /**
     * 开始新的结果收集
     */
    private startNewResult(line: string, originalLine: string): void {
        this.buffer = [line];
        this.rawBuffer = [originalLine];
        this.currentStackLevel = -1; // 重置调用栈层级
    }

    /**
     * 完成当前结果的收集
     */
    private finalizeCurrentResult(): void {
        if (!this.currentResult) return;

        // 如果没有提取到问题描述，使用异常名（ERROR或WARNING后面的全部内容）
        if (!this.currentResult.question) {
            this.currentResult.question = this.currentResult.exceptionName || '';
        }

        // 获取原始异常名并转换为中文
        const originalExceptionName = this.currentResult.exceptionName || '';
        const chineseExceptionName = getChineseExceptionName(originalExceptionName);

        // 保存完整的问题详情（原始错误内容块）
        const originData = this.rawBuffer.length > 0
            ? this.rawBuffer.join('\n')
            : '';

        // 确保所有必需字段都有值
        const result: Result = {
            title: this.currentResult.question,
            exceptionName: chineseExceptionName, // 使用中文异常名
            type: this.currentResult.type || 'error',
            questionType: this.currentResult.questionType!,
            question: this.formatQuestionName(this.currentResult.question),
            originData: originData,
            fileLink: this.currentResult.fileLink,
            row: this.currentResult.row,
            col: this.currentResult.col,
        };

        this.results.push(result);
        this.currentResult = null;
        this.buffer = [];
        this.rawBuffer = [];
        this.isInContentionEvent = false;
        this.currentStackLevel = -1; // 重置调用栈层级
    }

    /**
     * 完成所有解析，返回结果列表
     * 当控制台输出结束时调用此方法
     */
    public finalize(): Result[] {
        this.finalizeCurrentResult();
        return this.results;
    }

    /**
     * 获取当前已解析的结果（不等待完成）
     */
    public getResults(): Result[] {
        return [...this.results];
    }

    /**
     * 一次性解析全部内容并返回结果
     * 适用于已经获取完整内容的情况，不需要逐行处理
     * @param content 多行字符串内容，会按换行符分割后逐行处理
     * @returns 解析后的结果列表
     */
    public parseAll(content: string): Result[] {
        // 重置解析器状态，确保干净的状态
        this.reset();

        // 按换行符分割内容
        const lines = content.split(/\r?\n/);

        // 逐行处理
        for (const line of lines) {
            this.processLine(line);
        }

        // 完成解析并返回结果
        return this.finalize();
    }

    /**
     * 一次性解析全部行并返回结果
     * 适用于已经将内容分割为行数组的情况
     * @param lines 字符串数组，每行一个元素
     * @returns 解析后的结果列表
     */
    public parseAllLines(lines: string[]): Result[] {
        // 重置解析器状态，确保干净的状态
        this.reset();

        // 逐行处理
        for (const line of lines) {
            this.processLine(line);
        }

        // 完成解析并返回结果
        return this.finalize();
    }

    /**
     * 重置解析器状态
     */
    public reset(): void {
        this.results = [];
        this.currentResult = null;
        this.buffer = [];
        this.rawBuffer = [];
        this.currentQuestionType = null;
        this.isInContentionEvent = false;
        this.currentStackLevel = -1;
    }

    private formatQuestionName(name: string) {
        const keys = [...exceptionTpyeMap.keys()];
        for (let i = 0; i < keys.length; i++) {
            if (name.startsWith(keys[i])) {
                return keys[i]
            }
        }
        return name;
    }
}

