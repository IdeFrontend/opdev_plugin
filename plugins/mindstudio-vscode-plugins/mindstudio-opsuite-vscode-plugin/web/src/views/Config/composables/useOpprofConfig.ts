/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { reactive, ref } from "vue";

// 仿真配置数据类型
export interface SimulationConfig {
  collectionContent: {
    instructionFlow: boolean;
    operatorHotspot: boolean;
    memoryThroughput: boolean;
  };
  simulatorType: string;
  enableDump: boolean;
  mode: {
    renderInPlatform: boolean;
    downloadToLocal: boolean;
  };
  dataStoragePath: string;
}

// 上板配置数据类型
export interface OnboardConfig {
  collectionContent: {
    selectAll: boolean;
    memoryAnalysis: boolean;
    memoryAnalysisSub: {
      interCoreLoad: boolean;
      routineBottleneck: boolean;
      computeWorkload: boolean;
      memoryWorkload: boolean;
    };
    operatorHotspot: boolean;
    cacheHeatmap: boolean;
    operatorPerformance: boolean;
    operatorPerformanceSub: {
      cubeVectorTime: boolean;
      l2CacheHitRate: boolean;
      memoryBandwidth: boolean;
      l0Bandwidth: boolean;
      ubBandwidth: boolean;
      operatorBasicInfo: boolean;
      computeTransferRatio: boolean;
      resourceConflictRatio: boolean;
    };
  };
  mode: {
    renderInPlatform: boolean;
    downloadToLocal: boolean;
  };
  dataStoragePath: string;
  advanced: {
    useKernelSideCode: boolean;
    warmupCount: number;
    replayMode: string;
    advancedParams: Array<{ name: string; value: string; key: number }>;
  };
}

/**
 * 创建默认的仿真配置数据
 */
export function createDefaultSimulationConfig(): SimulationConfig {
  return {
    collectionContent: {
      instructionFlow: true, // 指令流水图 - 默认勾选且disable
      operatorHotspot: true, // 算子代码热点图 - 默认勾选且disable
      memoryThroughput: false, // 内存通路吞吐率波形图
    },
    simulatorType: "Ascend310P3", // 仿真器类型
    enableDump: false, // 控制仿真器dump文件是否生成
    mode: {
      renderInPlatform: false, // 平台内渲染结果
      downloadToLocal: false, // 下载数据到本地
    },
    dataStoragePath: "", // 数据存放位置
  };
}

/**
 * 创建默认的上板配置数据
 */
export function createDefaultOnboardConfig(): OnboardConfig {
  return {
    collectionContent: {
      selectAll: false, // 全选
      memoryAnalysis: false, // 内存分析图
      memoryAnalysisSub: {
        interCoreLoad: false, // 核间负载分析图
        routineBottleneck: false, // Roofine瓶颈分析
        computeWorkload: true, // 计算工作负载分析 - 默认勾选且disable
        memoryWorkload: true, // 内存负载分析 - 默认勾选且disable
      },
      operatorHotspot: false, // 算子代码热点图
      cacheHeatmap: false, // Cache热力图
      operatorPerformance: false, // 算子性能数据文件
      operatorPerformanceSub: {
        cubeVectorTime: false, // Cube及Vector类型指令耗时和占比
        l2CacheHitRate: false, // L2 Cache命中率
        memoryBandwidth: false, // 内存读写带宽速率
        l0Bandwidth: false, // L0读写带宽速率
        ubBandwidth: false, // UB读写带宽速率
        operatorBasicInfo: false, // 算子基础信息
        computeTransferRatio: false, // 计算单元和搬运单元耗时占比
        resourceConflictRatio: false, // 资源冲突占比
      },
    },
    mode: {
      renderInPlatform: false, // 平台内渲染结果
      downloadToLocal: false, // 下载数据到本地
    },
    dataStoragePath: "", // 数据存放位置
    advanced: {
      useKernelSideCode: false, // 使用Kernel侧制定代码段性能采集
      warmupCount: 0, // 上板预热次数
      replayMode: "kernel", // 上板重放模式: kernel, applicant, range
      advancedParams: [], // 高级参数
    },
  };
}

/**
 * Opprof配置管理 Composable
 */
export function useOpprofConfig() {
  const activeTab = ref("simulation");
  const simulationData = reactive<SimulationConfig>(createDefaultSimulationConfig());
  const onboardData = reactive<OnboardConfig>(createDefaultOnboardConfig());
  const updateIndex = ref(1);

  /**
   * 处理全选逻辑
   */
  const handleSelectAll = (checked: boolean) => {
    onboardData.collectionContent.selectAll = checked;
    if (checked) {
      onboardData.collectionContent.memoryAnalysis = true;
      onboardData.collectionContent.memoryAnalysisSub.interCoreLoad = true;
      onboardData.collectionContent.memoryAnalysisSub.routineBottleneck = true;
      onboardData.collectionContent.operatorHotspot = true;
      onboardData.collectionContent.cacheHeatmap = true;
      onboardData.collectionContent.operatorPerformance = true;
      Object.keys(onboardData.collectionContent.operatorPerformanceSub).forEach((key) => {
        if (key !== "computeWorkload" && key !== "memoryWorkload") {
          onboardData.collectionContent.operatorPerformanceSub[key as keyof typeof onboardData.collectionContent.operatorPerformanceSub] = true;
        }
      });
    } else {
      onboardData.collectionContent.memoryAnalysis = false;
      onboardData.collectionContent.memoryAnalysisSub.interCoreLoad = false;
      onboardData.collectionContent.memoryAnalysisSub.routineBottleneck = false;
      onboardData.collectionContent.operatorHotspot = false;
      onboardData.collectionContent.cacheHeatmap = false;
      onboardData.collectionContent.operatorPerformance = false;
      Object.keys(onboardData.collectionContent.operatorPerformanceSub).forEach((key) => {
        if (key !== "computeWorkload" && key !== "memoryWorkload") {
          onboardData.collectionContent.operatorPerformanceSub[key as keyof typeof onboardData.collectionContent.operatorPerformanceSub] = false;
        }
      });
    }
  };

  /**
   * 处理内存分析复选框变化
   */
  const handleMemoryAnalysisChange = (checked: boolean) => {
    if (checked) {
      // 勾选时，将所有可编辑的子项设为true
      onboardData.collectionContent.memoryAnalysisSub.interCoreLoad = true;
      onboardData.collectionContent.memoryAnalysisSub.routineBottleneck = true;
      // computeWorkload 和 memoryWorkload 是 disabled 的，不需要处理
    } else {
      // 取消勾选时，将所有可编辑的子项设为false
      onboardData.collectionContent.memoryAnalysisSub.interCoreLoad = false;
      onboardData.collectionContent.memoryAnalysisSub.routineBottleneck = false;
      // computeWorkload 和 memoryWorkload 是 disabled 的，不需要处理
    }
  };

  /**
   * 处理算子性能复选框变化
   */
  const handleOperatorPerformanceChange = (checked: boolean) => {
    if (checked) {
      // 勾选时，将所有可编辑的子项设为true
      Object.keys(onboardData.collectionContent.operatorPerformanceSub).forEach((key) => {
        onboardData.collectionContent.operatorPerformanceSub[key as keyof typeof onboardData.collectionContent.operatorPerformanceSub] = true;
      });
    } else {
      // 取消勾选时，将所有可编辑的子项设为false
      Object.keys(onboardData.collectionContent.operatorPerformanceSub).forEach((key) => {
        onboardData.collectionContent.operatorPerformanceSub[key as keyof typeof onboardData.collectionContent.operatorPerformanceSub] = false;
      });
    }
  };

  /**
   * 添加高级参数
   */
  const addAdvancedParam = () => {
    updateIndex.value++;
    if (!onboardData.advanced.advancedParams) {
      onboardData.advanced.advancedParams = [];
    }
    onboardData.advanced.advancedParams.push({
      name: "",
      value: "",
      key: onboardData.advanced.advancedParams.length,
    });
  };

  /**
   * 删除高级参数
   */
  const deleteAdvancedParam = (key: number) => {
    updateIndex.value++;
    onboardData.advanced.advancedParams.splice(key, 1);
    onboardData.advanced.advancedParams.forEach((v, i) => {
      v.key = i;
    });
  };

  return {
    activeTab,
    simulationData,
    onboardData,
    updateIndex,
    handleSelectAll,
    handleMemoryAnalysisChange,
    handleOperatorPerformanceChange,
    addAdvancedParam,
    deleteAdvancedParam,
  };
}

