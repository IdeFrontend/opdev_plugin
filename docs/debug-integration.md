# Debug Integration Architecture

This document describes how debugging is integrated in the Huawei OP DevTools VS Code extension: protocols, VS Code debug UI usage, and the full architecture from entry points to the MindStudio Debug extension.

---

## Overview

The plugin does **not** implement a debug adapter. It:

- Ensures the **MindStudio Debug** extension (`ascend.mindstudio-debug-vscode-plugin`) is installed.
- Injects **launch configurations** (`msdebug`, `msdebug-cpu`, `msdebug-python`) into operator projects.
- **Starts** debug sessions by name via the VS Code Debug API and opens the standard debug UI (Configure, REPL).

The actual debug engine uses the **Debug Adapter Protocol (DAP)** and is implemented by the MindStudio Debug extension.

---

## Protocols

```mermaid
flowchart LR
  subgraph Plugin["This plugin"]
    Webview[Operate panel]
    TaskCtrl[Task controller]
    Webview -->|"postMessage / request"| TaskCtrl
  end

  subgraph VSCode["VS Code"]
    DebugAPI[vscode.debug API]
    DebugUI[Debug UI / RUN AND DEBUG]
  end

  subgraph External["MindStudio Debug extension"]
    DAPAdapter[Debug Adapter]
  end

  subgraph Target["Debug target"]
    GDB[GDB / Python / NPU]
  end

  TaskCtrl -->|startDebugging(name)| DebugAPI
  DebugAPI --> DebugUI
  DebugAPI -->|"resolve type msdebug-mi"| DAPAdapter
  DAPAdapter <-->|DAP JSON-RPC| DebugUI
  DAPAdapter -->|stdio/socket| GDB
```

| Layer | Protocol | Role |
|-------|----------|------|
| **Webview → Plugin** | Custom request/response over webview messaging | Operate panel calls `webview/runDebug`, `webview/runCpuDebug`, etc. |
| **Plugin → VS Code** | VS Code Extension API (`vscode.debug`, `vscode.commands`) | Start session by config name; open Configure / REPL |
| **VS Code ↔ Debug Adapter** | **Debug Adapter Protocol (DAP)** | JSON-RPC over stdio/socket; implemented by MindStudio Debug extension |
| **Debug Adapter → Target** | Tool-specific (GDB MI, Python, NPU) | MindStudio adapter talks to GDB / Python / NPU debuggee |

---

## High-Level Architecture

```mermaid
flowchart TB
  subgraph Entry["Entry points"]
    Explorer["Explorer context menu\n(调试 submenu)"]
    Operate["Operate panel\n(webview)"]
  end

  subgraph Plugin["Plugin (plugin/src)"]
    Commands["extension.ts\nRegistered commands"]
    FolderSvc["FolderContextMenuService"]
    ApiSrv["ApiServer\n(webview/runDebug etc.)"]
    TaskCtrl["TaskController\nrunDebug / runCpuDebug\ndebugConfig / cpuDebugConfig"]
    LaunchJson["debug-launch.json\n(msdebug, msdebug-cpu, msdebug-python)"]
    ProjectUtils["project-utils\nensureLaunchJsonExists"]
    Installer["MindStudioPluginInstaller\n(install msdebug extension)"]
  end

  subgraph VSCode["VS Code"]
    DebugAPI["vscode.debug.startDebugging\nworkbench.action.debug.*"]
    Resolve["Resolve config by name\n→ launch.json"]
  end

  subgraph Ext["External extension"]
    MSDebug["ascend.mindstudio-debug-vscode-plugin\n(type: msdebug-mi)"]
  end

  Explorer --> Commands --> FolderSvc --> TaskCtrl
  Operate --> ApiSrv --> TaskCtrl
  TaskCtrl --> LaunchJson
  ProjectUtils --> LaunchJson
  TaskCtrl --> DebugAPI
  extension.ts --> Installer
  Installer -.->|"ensure installed"| MSDebug
  DebugAPI --> Resolve --> MSDebug
```

---

## Debug Session Start Flow

```mermaid
sequenceDiagram
  participant User
  participant Webview as Operate panel / Explorer
  participant Api as ApiServer / Commands
  participant Task as TaskController
  participant Build as BuildService
  participant VSCode as VS Code
  participant MS as MindStudio Debug

  User->>Webview: Click CPU/NPU Debug or Configure
  Webview->>Api: webview/runDebug or command
  Api->>Task: runDebug() / runCpuDebug() / debugConfig()

  alt Start debugging
    Task->>Build: startBuild(npu_debug_script / cpu_debug_script)
    Build-->>Task: build done
    Task->>Task: getProjectType() → choose config name
    Task->>VSCode: startDebugging(workspaceFolder, "msdebug"|"msdebug-cpu"|"msdebug-python")
    VSCode->>VSCode: Read .vscode/launch.json
    VSCode->>MS: Activate adapter for type "msdebug-mi"
    MS-->>VSCode: DAP session
    VSCode->>User: Open Debug sidebar, Console, etc.
  else Configure
    Task->>VSCode: executeCommand(workbench.action.debug.configure)
    VSCode->>User: Open launch.json
  end
```

---

## Launch Configurations

Configurations are defined in `plugin/src/domain/utils/debug-launch.json` and copied into each operator project’s `.vscode/launch.json` (and `.arts/launch.json`) by `ensureLaunchJsonExists()`.

```mermaid
flowchart LR
  subgraph Template["debug-launch.json"]
    C1["msdebug\nNPU"]
    C2["msdebug-cpu\nCPU, GDB"]
    C3["msdebug-python\nPython torch_library"]
  end

  subgraph Project[Operator project]
    VSC[".vscode/launch.json"]
    Arts[".arts/launch.json"]
  end

  C1 --> VSC
  C2 --> VSC
  C3 --> VSC
  C1 --> Arts
  C2 --> Arts
  C3 --> Arts
```

| Name | Type | Use case |
|------|------|----------|
| **msdebug** | `msdebug-mi` | NPU debug; target: `build/${workspaceFolderBasename}` |
| **msdebug-cpu** | `msdebug-mi` | CPU debug; `msdebugMiPath`: `/usr/bin/gdb` |
| **msdebug-python** | `msdebug-mi` | Python (e.g. `torch_library_template`); target: `/usr/local/bin/python`, args: `run.py` |

Config selection in code:

- **NPU:** `ascend` + `torch_library_template` → `msdebug-python`, else `msdebug`.
- **CPU:** same project/template check → `msdebug-python` or `msdebug-cpu`.

---

## Component Map (plugin/src)

```mermaid
flowchart TB
  subgraph Config["Config & bootstrap"]
    A["domain/utils/debug-launch.json"]
    B["domain/utils/project-utils.ts\nensureLaunchJsonExists"]
    C["extension.ts\nCommands + MindStudioPluginInstaller"]
  end

  subgraph Execution["Execution path"]
    D["controller/task-controller.ts\nrunDebug, runCpuDebug,\ndebugConfig, cpuDebugConfig"]
    E["service/folder-context-menu-service.ts\ncpu/npuDebugOperatorProject\ncpu/npuDebugConfigOperatorProject"]
    F["api-routes.ts → controller/index.ts\nwebviewMethods includes taskMethods"]
  end

  subgraph Manifest["Manifest"]
    G["package.json\noperator.debug submenu\ncontributes.commands"]
  end

  A --> B
  C --> E
  C --> D
  F --> D
  E --> D
  D --> A
  G --> C
```

| File | Role |
|------|------|
| `domain/utils/debug-launch.json` | Template for the three `msdebug-mi` launch configs |
| `domain/utils/project-utils.ts` | Writes template to `.vscode/launch.json` and `.arts/launch.json` for new projects |
| `controller/task-controller.ts` | Build + `startDebugging(name)` or `workbench.action.debug.configure` |
| `service/folder-context-menu-service.ts` | Explorer menu handlers that call task controller methods |
| `api-routes.ts` / `controller/index.ts` | Expose `webview/runDebug`, `webview/runCpuDebug`, etc. via `taskMethods` |
| `extension.ts` | Registers debug commands; runs MindStudioPluginInstaller on activate |
| `class/mind-studio-plugin-installer.ts` | Ensures `ascend.mindstudio-debug-vscode-plugin` is installed |
| `constants.ts` | Command IDs for the four debug-related commands |
| Root `package.json` | `contributes`: `operator.debug` submenu, commands, configuration (`op-devtools.debugMode`) |

---

## VS Code Debug UI Integration

The plugin does not add custom debug views. It uses the built-in RUN AND DEBUG experience:

1. **Starting a session**  
   `vscode.debug.startDebugging(workspaceFolder, debugConfigName)` causes VS Code to:
   - Resolve the named config from `launch.json`
   - Activate the extension that contributes the debug type (`msdebug-mi`)
   - Run that extension’s Debug Adapter and open the default Debug sidebar, Debug Console, Variables, Call Stack, etc.

2. **Configuring**  
   `workbench.action.debug.configure` opens the standard `launch.json` editor.

3. **REPL**  
   `workbench.debug.action.toggleRepl` toggles the Debug Console.

So all “debug windows” are VS Code’s native debug UI; the plugin only triggers them.

---

## Summary

- **Protocols:** DAP (VS Code ↔ MindStudio Debug adapter), Extension API (plugin ↔ VS Code), webview messaging (Operate panel ↔ plugin).
- **VS Code debug UI:** Standard RUN AND DEBUG views; the plugin starts sessions and opens Configure/REPL via the Debug API and built-in commands.
- **Architecture:** Entry points (Explorer menu + webview API) → plugin task controller → `startDebugging` / configure → VS Code → MindStudio Debug extension (DAP) → debuggee. This repo provides launch configs and orchestration; the debug engine and DAP live in the MindStudio Debug extension.
