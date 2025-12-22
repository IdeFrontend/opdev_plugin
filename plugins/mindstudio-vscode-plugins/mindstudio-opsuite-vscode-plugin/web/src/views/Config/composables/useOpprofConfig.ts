/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { reactive, ref } from "vue";

// 仿真配置数据类型
export interface SimulationConfig {
  // collectionContent: {
  //   instructionFlow: boolean;
  //   operatorHotspot: boolean;
  //   memoryThroughput: boolean;
  // };
  // simulatorType: string;
  // enableDump: boolean;
  // mode: {
  //   renderInPlatform: boolean;
  //   downloadToLocal: boolean;
  // };
  // dataStoragePath: string;
  // config_id: string,

  config_id: string,
  project_id: string,
  user_options: {
    op: string,
    script: string,
    soc_version: string,
    config_name: string,
    // 内存通路吞吐率波形图
    PMSampling: boolean,
    downloadToLocal: boolean,
    renderInPlatform: boolean,
    dataStoragePath: string,
    simulatorType: string,
    enableDump: boolean
  },
}

// 上板配置数据类型
export interface OnboardConfig {
  // collectionContent: {
  //   selectAll: boolean;
  //   memoryAnalysis: boolean;
  //   memoryAnalysisSub: {
  //     interCoreLoad: boolean;
  //     routineBottleneck: boolean;
  //     computeWorkload: boolean;
  //     memoryWorkload: boolean;
  //   };
  //   operatorHotspot: boolean;
  //   cacheHeatmap: boolean;
  //   operatorPerformance: boolean;
  //   operatorPerformanceSub: {
  //     cubeVectorTime: boolean;
  //     l2CacheHitRate: boolean;
  //     memoryBandwidth: boolean;
  //     l0Bandwidth: boolean;
  //     ubBandwidth: boolean;
  //     operatorBasicInfo: boolean;
  //     computeTransferRatio: boolean;
  //     resourceConflictRatio: boolean;
  //   };
  // };
  // mode: {
  //   renderInPlatform: boolean;
  //   downloadToLocal: boolean;
  // };
  // dataStoragePath: string;
  // advanced: {
  //   useKernelSideCode: boolean;
  //   advancedParams: Array<{ name: string; value: string; key: number }>;
  // };

  config_id: string,
  project_id: string,
  user_options: {
    op: string,
    script: string,
    config_name: string,
    // 内存分析图 相关
    // 核间负载分析图
    Occupancy: boolean,
    // Roofline瓶颈分析
    Roofline: boolean,

    // 算子代码热点图
    Source: boolean,
    // Cache热力图
    MemoryDetail: boolean,

    // 算子性能数据文件 相关
    // Cube及Vector类型指令耗时和占比
    ArithmeticUtilization: boolean,
    // L2 Cache命中率
    L2Cache: boolean,
    // 内存读写带宽速率
    Memory: boolean,
    // L0读写带宽速率
    MemoryL0: boolean,
    // UB读写带宽速率
    MemoryUB: boolean,
    // 算子基础信息
    OpBasicInfo: boolean,
    // 计算单元和搬运单元耗时占比
    PipeUtilization: boolean,
    // 资源冲突占比
    ResourceConflictRatio: boolean,

    // 使能Kernel侧制定代码段性能采集
    KernelScale: boolean,
    downloadToLocal: boolean,
    renderInPlatform: boolean,
    dataStoragePath: string,
  },

}

/**
 * 创建默认的仿真配置数据
 */
export function createDefaultSimulationConfig(): SimulationConfig {
  return {
    config_id: '',
    project_id: '',
    user_options: {
      op: '',
      script: '',
      soc_version: '',
      config_name: '',
      PMSampling: true, // 内存通路吞吐率波形图
      downloadToLocal: true, // 下载数据到本地
      renderInPlatform: false, // 平台内渲染结果
      dataStoragePath: '', // 数据存放位置
      simulatorType: '', // 仿真器类型
      enableDump: false, // 控制仿真器dump文件是否生成
    },
  };
}

/**
 * 创建默认的上板配置数据
 */
export function createDefaultOnboardConfig(): OnboardConfig {
  return {
    project_id: '',
    config_id: '',
    user_options: {
      op: '',
      script: 'msprof op',
      config_name: '',
      // 内存分析图 相关
      // 核间负载分析图
      Occupancy: true,
      // Roofline瓶颈分析
      Roofline: true,

      // 算子代码热点图
      Source: true,
      // Cache热力图
      MemoryDetail: true,

      // 算子性能数据文件 相关
      // Cube及Vector类型指令耗时和占比
      ArithmeticUtilization: true,
      // L2 Cache命中率
      L2Cache: true,
      // 内存读写带宽速率
      Memory: true,
      // L0读写带宽速率
      MemoryL0: true,
      // UB读写带宽速率
      MemoryUB: true,
      // 算子基础信息
      OpBasicInfo: true,
      // 计算单元和搬运单元耗时占比
      PipeUtilization: true,
      // 资源冲突占比
      ResourceConflictRatio: true,

      // 使能Kernel侧制定代码段性能采集
      KernelScale: true,
      downloadToLocal: true,
      renderInPlatform: false,
      dataStoragePath: '',
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
    const keyArray = ['Occupancy', 'Roofline', 'Source', 'MemoryDetail', 'ArithmeticUtilization', 'L2Cache', 'Memory', 'MemoryL0', 'MemoryUB', 'OpBasicInfo', 'PipeUtilization', 'ResourceConflictRatio']
    keyArray.forEach(key => {
      onboardData.user_options[key] = checked
    })
  };

  /**
   * 处理内存分析复选框变化
   */
  const handleMemoryAnalysisChange = (checked: boolean) => {
    const keyArray = ['Occupancy', 'Roofline']
    keyArray.forEach(key => {
      onboardData.user_options[key] = checked
    })
  };

  /**
   * 处理算子性能复选框变化
   */
  const handleOperatorPerformanceChange = (checked: boolean) => {
    const keyArray = ['ArithmeticUtilization', 'L2Cache', 'Memory', 'MemoryL0', 'MemoryUB', 'OpBasicInfo', 'PipeUtilization', 'ResourceConflictRatio']
    keyArray.forEach(key => {
      onboardData.user_options[key] = checked
    })
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

  const initSimulate = (data: any) => {
    console.log('simulationData', data)
    // simulationData.collectionContent.memoryThroughput = data.user_options.PMSampling
    // simulationData.mode.downloadToLocal = data.user_options.downloadToLocal
    // simulationData.mode.renderInPlatform = data.user_options.renderInPlatform
    // simulationData.dataStoragePath = data.user_options.dataStoragePath
    // simulationData.config_id = data.config_id
    // simulationData.simulatorType = data.simulatorType
    // simulationData.enableDump = data.enableDump

    simulationData.config_id = data.config_id
    simulationData.project_id = data.project_id
    Object.assign(simulationData.user_options, data.user_options)
    console.log('simulationData.user_options, data.user_options', simulationData.user_options, data.user_options)
  }


  const initOnBoard = (data: any) => {
    console.log('initOnBoard', data)
    onboardData.config_id = data.config_id
    onboardData.project_id = data.project_id
    Object.assign(onboardData.user_options, data.user_options)
    console.log('onboardData.user_options, data.user_options', onboardData.user_options, data.user_options)
  }

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
    initSimulate,
    initOnBoard
  };
}

