import { decidePythonTargetAction } from '@plugin/helpers/sync-sanitizer-python-target';

describe('decidePythonTargetAction', () => {
  const ext = '.py';

  it('syncs from the active editor when a matching file is focused', () => {
    expect(decidePythonTargetAction({
      activeFileName: '/ws/op/triton2.py',
      activeFileExtension: ext,
      existingTargetFile: undefined,
    }))
      .toBe('sync-from-active');
  });

  it('prefers the active editor even when a target is already stored', () => {
    expect(decidePythonTargetAction({
      activeFileName: '/ws/op/triton2.py',
      activeFileExtension: ext,
      existingTargetFile: 'python3 old.py',
    }))
      .toBe('sync-from-active');
  });

  it('falls back to the stored target when no editor is active (run from the webview panel)', () => {
    expect(decidePythonTargetAction({
      activeFileName: undefined,
      activeFileExtension: ext,
      existingTargetFile: 'python3 triton2.py',
    }))
      .toBe('use-existing');
  });

  it('reports no-target when no editor is active and nothing was captured', () => {
    expect(decidePythonTargetAction({
      activeFileName: undefined,
      activeFileExtension: ext,
      existingTargetFile: undefined,
    }))
      .toBe('no-target');
  });

  it('treats an empty/whitespace stored target as no-target', () => {
    expect(decidePythonTargetAction({
      activeFileName: undefined,
      activeFileExtension: ext,
      existingTargetFile: '   ',
    }))
      .toBe('no-target');
  });

  it('reuses the stored target when a non-py file is focused (does not block on a README/JSON tab)', () => {
    expect(decidePythonTargetAction({
      activeFileName: '/ws/op/notes.md',
      activeFileExtension: ext,
      existingTargetFile: 'python3 triton2.py',
    }))
      .toBe('use-existing');
  });

  it('reports no-target when a non-py file is focused and nothing was captured', () => {
    expect(decidePythonTargetAction({
      activeFileName: '/ws/op/notes.md',
      activeFileExtension: ext,
      existingTargetFile: undefined,
    }))
      .toBe('no-target');
  });
});
