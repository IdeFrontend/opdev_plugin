# План: Performance hints из `.npu-rep` как нативные VS Code Diagnostics

## Context

Раньше планировалась отдельная webview-панель `web/src/views/panels/performance-hints/` — **отменена**.
Новое решение: hints из `.npu-rep` отчётов показываются как нативные проблемы VS Code
(Diagnostics, панель Problems).

- `.npu-rep` — бинарный контейнер (header 36 байт + FileInfo 160/164 байт; magic `npu-rep\0`),
  внутри — CSV, включая 5 таблиц hints: `HintMessages`, `HintTypes`, `InstructionHints`,
  `SourceLineHints`, `KernelHints`; возможны вложенные per-operator архивы
  (тип 6 в 164-формате, тип 1 в 160-формате).
- Рабочие парсеры и join hints уже есть в сабмодуле `profiling-report`
  (ветка `feat/performance-hints`): `adaptEmulate.performanceHintsFromPayloads`,
  `parseNpuRep.ts`, `parseNpuRep160.ts`, `parseCsv.ts`. **Сабмодуль не модифицировать**,
  только перенести минимально необходимый код в extension host.
- Фикстуры: `profiling-report/data/gelu.npu-rep` (53 hints: 25 instruction / 20 sourceLine / 8 kernel),
  `result.npu-rep` (160-байт, 6 файлов, hints нет), `example160.npu-rep`.
- Вход в `.npu-rep`: `ViewOpener.openProfilingReport` → `ProfilingReportPanel`
  (команда `huawei-op-devtools.openProfilingReport`, регистрация в `plugin/src/extension.ts`);
  дерево `OperateTreeProvider.openPerformanceFile` (fileType `npu-rep`) → `viewService.openProfilingReport`.
- Паттерн для диагностики уже есть: `SanitizerDiagnosticsService`
  (`plugin/src/service/sanitizer-diagnostics.service.ts`, активация `extension.ts:358`).
- **Доп. требование (от пользователя):** при переключении активной вкладки profiling report
  hints в Problems должны обновляться; при смене выбранного оператора внутри отчёта — тоже.

## Approach

1. **Перенос парсера** в `plugin/src/core/profiling/` (чистый TS, без VS Code API):
   `parse-npu-rep.ts`, `parse-npu-rep-160.ts`, `parse-csv.ts`, `npu-rep-hints.ts`, `types.ts`.
   Поведение 1:1 с сабмодулем; префиксы ошибок → `[opdevtools profiling]`.
2. **Сервис** `plugin/src/service/performance-hints-diagnostics.service.ts`:
   - `activate(context)`: `vscode.languages.createDiagnosticCollection('opdevtools.performanceHints')`
     (новая функция `performanceHintsDiagnosticCollectionId()` в `shared/flavor/index.ts`);
     clear при смене workspace-папок.
   - `publishFromFile(filePath, options?: { operatorId?: string })`: парсинг + clear + set.
     - **resource**: если `sourceLineId` удалось сопоставить с файлом (через `SourceLines` /
       `SourceFiles` / `DebugInfo` из контейнера + поиск файла в workspace: точный путь,
       затем `workspace.findFiles('**/'+basename)`) → diagnostic на файле, range
       `(line-1, 0, line-1, 2000)` (1-based → 0-based); иначе — на самом `.npu-rep` (range 0,0,0,0).
     - **message**: `typeName: message` (+ ` (PC: …)` при наличии pc); пустые
       Source Line / PC не показываем («Not specified» нет).
     - **severity**: `DiagnosticSeverity.Information` (единообразно для всех hints).
     - **source**: `t('performanceHints.source')`; **code**: `typeName ?? origin`.
   - `showPerformanceHintsForFile(path)`: publish + `workbench.actions.view.problems` (раскрыть Problems).
   - Владельческая очистка: `clearIfOwns(filePath)` (clear, только если коллекция содержит
     hints этого файла) — для dispose/переключения вкладок.
3. **Триггеры и синхронизация с вкладками/оператором:**
   - `ViewOpener.openProfilingReport`: после открытия панели для `.npu-rep` →
     `publishFromFile` (отдельный try/catch, ошибка → warning i18n, не ломает открытие).
     Передать в `ProfilingReportPanel.createOrShow` колбэки:
     - `onActiveChanged(active)`: для `.npu-rep` active → `publishFromFile`; неактивен →
       `clearIfOwns`. Для прочих (`.rep`/`.ncrep`) active → `clear()` (hints следуют за
       активной вкладкой).
     - `onDispose` (`.npu-rep`): `clearIfOwns`.
   - `ProfilingReportPanel`: подписка `panel.onDidChangeViewState` (активность) и
     обработка нового webview-сообщения `profilingReportOperatorChanged { operatorId }`
     → колбэк `onOperatorChanged(operatorId | null)`.
   - `web/src/views/panels/profiling-report/app.vue` (наш файл, сабмодуль не трогаем):
     template ref на `<ProfilingReport>` + `watch(() => reportRef.value?.selectedOperatorId,
     { immediate: true })` → `vscode.postMessage({ command: 'profilingReportOperatorChanged',
     operatorId: id ?? null })`. Хост на это перепубликует hints выбранного оператора.
   - Новая команда `huawei-op-devtools.showPerformanceHints` (constants.ts + регистрация
     в extension.ts): аргумент Uri / строка / TreeItem `{id}`; путь из id-префикса
     `performance-file:` (паттерн `sanitizer.message.aiFix`) → `showPerformanceHintsForFile`.
   - Корневой `package.json`: contribution команды + пункт меню `view/item/context`
     `when: view == opdevtoolsPerformanceResultsTree && viewItem =~ /opdevtools\\.performanceFile\\.npu-rep/`
     (group `navigation@2`).
4. **i18n**: `shared/i18n/en.ts` + `zh-cn.ts` (`performanceHints.source`,
   `performanceHints.publishFailed`, `performanceHints.empty`); заголовок команды в
   `package.nls.base.json`, `package.nls.json`, `package.nls.en.json`, `package.nls.base.en.json`
   (`command.showPerformanceHints.title`).
5. Кастомная webview для hints не создаётся; сабмодуль не модифицируется; родительский
   коммит (в т.ч. закрепление сабмодуля) не делаем.

## Контракт API парсера (фиксирован до реализации)

```ts
// plugin/src/core/profiling/types.ts
export interface PerformanceHintItem {
  message: string;
  typeName?: string;
  sourceLineId?: string;
  pc?: string;
  origin: 'instruction' | 'sourceLine' | 'kernel';
}
export interface NpuRepHintParseResult {
  hints: PerformanceHintItem[];
  sourceLines: Map<string, { line?: number; file?: string }>; // sourceLineId → info
}
// plugin/src/core/profiling/index.ts
export function parsePerformanceHints(
  bytes: Uint8Array,
  options?: { operatorId?: string },
): NpuRepHintParseResult;
```

Семантика `operatorId`: контейнер с вложенными архивами → hints выбранного листа
(undefined → первый, как в библиотеке); плоский лист → все payloads; неизвестный id → пусто.

## Files to modify

Новые:
- `plugin/src/core/profiling/index.ts`, `parse-npu-rep.ts`, `parse-npu-rep-160.ts`,
  `parse-csv.ts`, `npu-rep-hints.ts`, `types.ts`
- `plugin/src/service/performance-hints-diagnostics.service.ts`
- `plugin/src/__tests__/unit/npu-rep-hints.spec.ts`
- `plugin/src/__tests__/unit/performance-hints-diagnostics.service.spec.ts`

Правки:
- `plugin/src/core/view/view-opener.ts`
- `plugin/src/class/profiling-report-panel.ts` (+ спеку `plugin/src/class/__tests__/profiling-report-panel.spec.ts`)
- `plugin/src/extension.ts`
- `plugin/src/constants.ts`
- `shared/flavor/index.ts`
- `shared/i18n/en.ts`, `shared/i18n/zh-cn.ts`
- `web/src/views/panels/profiling-report/app.vue`
- `package.json` (корневой манифест), `package.nls.base.json`, `package.nls.json`,
  `package.nls.en.json`, `package.nls.base.en.json`

Запрещено: любые файлы `profiling-report/**` (сабмодуль), `web/src/views/panels/performance-hints/**`
(создавать не нужно).

## Reuse

- `SanitizerDiagnosticsService` (`plugin/src/service/sanitizer-diagnostics.service.ts`) — паттерн activate/publish/clear, мок-паттерн в его спеке.
- `stableCommandId` + `resolvePerformanceFileCommandId` (`plugin/src/class/operate-tree-provider.ts`) — паттерн per-row команд; для меню — паттерн `sanitizer.message.aiFix` (идентичность из `id` TreeItem).
- `performanceHintsDiagnosticCollectionId()` / `treeItemContextKey()` (`shared/flavor/index.ts`).
- Парсеры сабмодуля `profiling-report/src/adapters/{parseNpuRep,parseNpuRep160,parseCsv}.ts` и join `performanceHintsFromPayloads` (`adaptEmulate.ts:341`) — портируются 1:1.
- Фикстуры `profiling-report/data/{gelu,result,example160}.npu-rep` (чтение из тестов: `../../../../profiling-report/data/...`).

## Steps

- [ ] 0. **Pre-flight** (bash-субагент): чистое дерево, ветка/HEAD в порядке, сабмодуль на
      `feat/performance-hints` без локальных изменений, зависимости установлены. Грязно → стоп.
- [ ] 1. **Парсер** (domainengineer): `plugin/src/core/profiling/**` + `npu-rep-hints.spec.ts`.
      Тесты: gelu → 53 hints (25/20/8, pc `624191680372`, quoted CSV с запятыми);
      result → парсится, 0 hints; example160 → парсится (фактический формат подтвердить);
      rejection-кейсы (magic/version/truncation обоих форматов); синтетический 160-пак
      (мини-пакер в тесте) для join/SourceLines/operatorId (первый по умолчанию, явный,
      неизвестный → пусто).
- [ ] 2. **Сервис + триггеры** (nodejsengineer): service, ViewOpener, ProfilingReportPanel
      (+обновлённая спека панели), extension.ts, constants.ts, flavor, package.json/nls,
      i18n en/zh, `web/.../app.vue`; спеки сервиса (publish/clear/маппинг/fallback/severity/
      source/code/reveal/clearIfOwns/operatorId).
- [ ] 3. **Верификация** (bash-субагент): tsc (как CI: `tsc -b`/скрипты пакетов), полный
      `pnpm --filter @mstt/plugin test:unit`, сборка web (vite/type-check). Критерии: зелёно,
      нет деградации существующих тестов, `git status` в сабмодуле чист, в родителе — только
      наши файлы.
- [ ] 4. **Ревью** (reviewer) по диффу против критериев приёмки; находки → 1 цикл правок →
      повторная верификация.
- [ ] 5. **Отчёт**: файлы, тесты, резолв конфликтов (не ожидаются), остаточные риски.
      Без коммита/пуша в родителе.

## Verification

- `pnpm --filter @mstt/plugin test:unit` (runInBand) — все существующие + новые спеки зелёные.
- `tsc`-проверка плагина и сборка web проходят.
- Сценарий: открыть `gelu.npu-rep` → в Problems 53 Information-диагностики (source
  «Performance Hints»); переключиться на другую вкладку → hints очищены/обновлены по активной;
  для multi-op контейнера сменить оператор в селекторе → hints переопубликованы;
  команда/меню `Show Performance Hints` → повторный показ + фокус Problems;
  неразрешимые sourceLineId → диагностики привязаны к `.npu-rep`.
