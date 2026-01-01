import BuildConfig from './BuildConfig';

export default class OpsConfig {
  private opsName: string;
  private buildConfig: BuildConfig;
  private state: string;
  constructor(opsName: string) {
    this.opsName = opsName;
    this.state = 'show';
    this.buildConfig = new BuildConfig(this.opsName);
  }
}
