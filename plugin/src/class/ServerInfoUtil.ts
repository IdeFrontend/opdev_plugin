/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import os from 'os';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export interface ServerInfo {
  hostname: string;
  username: string;
  ipAddress: string;
  platform: string;
  networkInterfaces: NetworkInterface[];
  timestamp: Date;
}

export interface NetworkInterface {
  name: string;
  address: string;
  family: string;
  internal: boolean;
  mac: string;
}

export class ServerInfoUtil {
  /**
   * 获取服务器主机名
   */
  static getHostname(): string {
    return os.hostname();
  }

  /**
   * 获取当前用户名
   */
  static getUsername(): string {
    try {
      // 在不同操作系统上获取用户名
      return (
        os.userInfo().username ||
        process.env.USER ||
        process.env.USERNAME ||
        'unknown'
      );
    } catch {
      return 'unknown';
    }
  }

  /**
   * 获取所有网络接口信息
   */
  static getNetworkInterfaces(): NetworkInterface[] {
    const interfaces = os.networkInterfaces();
    const result: NetworkInterface[] = [];

    Object.keys(interfaces).forEach((interfaceName) => {
      const interfaceInfo = interfaces[interfaceName];

      if (interfaceInfo) {
        interfaceInfo.forEach((info) => {
          if (info.family === 'IPv4' && !info.internal) {
            result.push({
              name: interfaceName,
              address: info.address,
              family: info.family,
              internal: info.internal,
              mac: info.mac,
            });
          }
        });
      }
    });

    return result;
  }

  /**
   * 获取主要IP地址（第一个非内部IPv4地址）
   */
  static getPrimaryIP(): string {
    const interfaces = this.getNetworkInterfaces();

    return interfaces.length > 0 ? interfaces[0].address : '127.0.0.1';
  }

  /**
   * 通过DNS解析获取公网IP（需要网络连接）
   */
  static async getPublicIP(): Promise<string> {
    try {
      // 使用公共DNS服务获取本机公网IP
      const lookupResult = await dnsLookup(this.getHostname());

      return lookupResult.address;
    } catch (error) {
      console.warn('无法获取公网IP:', error);

      return this.getPrimaryIP();
    }
  }

  /**
   * 获取完整的服务器信息
   */
  static async getServerInfo(
    includePublicIP: boolean = false,
  ): Promise<ServerInfo> {
    const baseInfo: ServerInfo = {
      hostname: this.getHostname(),
      username: this.getUsername(),
      ipAddress: this.getPrimaryIP(),
      platform: `${os.platform()} ${os.arch()}`,
      networkInterfaces: this.getNetworkInterfaces(),
      timestamp: new Date(),
    };

    if (includePublicIP) {
      baseInfo.ipAddress = await this.getPublicIP();
    }

    return baseInfo;
  }

  /**
   * 获取指定网络接口的IP地址
   */
  static getIPByInterface(interfaceName: string): string | null {
    const interfaces = os.networkInterfaces();
    const interfaceInfo = interfaces[interfaceName];

    if (!interfaceInfo) {
      return null;
    }

    const ipv4 = interfaceInfo.find(
      (info) => info.family === 'IPv4' && !info.internal,
    );

    return ipv4 ? ipv4.address : null;
  }

  /**
   * 检查网络连接状态
   */
  static async checkNetworkConnectivity(): Promise<boolean> {
    try {
      await this.getPublicIP();

      return true;
    } catch {
      return false;
    }
  }
}
