import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
}));

describe('main entrypoint', () => {
  beforeEach(() => {
    renderMock.mockClear();
    createRootMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
  });

  it('mounts the app to the root element', async () => {
    await import('./main');

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
