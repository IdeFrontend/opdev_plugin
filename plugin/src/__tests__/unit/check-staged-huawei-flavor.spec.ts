import { validateGuardedFile } from '../../../../scripts/check-staged-huawei-flavor';

describe('check-staged-huawei-flavor', () => {
  it('accepts Huawei package.json while ignoring flavor script names in scripts', () => {
    const content = JSON.stringify({
      name: 'huawei-op-devtools-vscode-plugin',
      displayName: 'Huawei OP DevTools',
      publisher: 'huawei',
      activationEvents: ['onView:opdevtoolsHomeTree'],
      contributes: {
        commands: [{ command: 'huawei-op-devtools.open' }],
        configuration: [{ id: 'op-devtools.operatorSupport' }],
      },
      scripts: { 'apply-flavor:ascend-c-toolkit': 'tsx scripts/apply-flavor.ts ascend-c-toolkit' },
    }, null, 2);

    expect(validateGuardedFile('package.json', content))
      .toEqual([]);
  });

  it('rejects Ascend manifest content in package.json', () => {
    const content = JSON.stringify({
      name: 'asc-toolkit',
      displayName: 'Ascend C Toolkits',
      publisher: 'cann-pub',
      activationEvents: ['onView:ascendCToolkitHomeTree'],
      contributes: { commands: [{ command: 'ascend-c-toolkit.open' }] },
    }, null, 2);

    const errors = validateGuardedFile('package.json', content);

    expect(errors.length)
      .toBeGreaterThan(0);
    expect(errors.join('\n'))
      .toMatch(/Ascend C Toolkit/);
  });

  it('rejects manifest with commandPrefix used for configuration categories', () => {
    const content = JSON.stringify({
      name: 'huawei-op-devtools-vscode-plugin',
      displayName: 'Huawei OP DevTools',
      publisher: 'huawei',
      contributes: {
        commands: [{ command: 'huawei-op-devtools.open' }],
        configuration: [{ id: 'huawei-op-devtools.sanitizer' }],
      },
    }, null, 2);

    const errors = validateGuardedFile('package.json', content);

    expect(errors.some((error) => error.includes('commandPrefix')))
      .toBe(true);
  });
});
