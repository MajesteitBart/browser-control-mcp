// Jest setup file for browser API mocking

// Mock DOM APIs used by full page screenshot
global.OffscreenCanvas = jest.fn().mockImplementation((width, height) => {
  const canvas = {
    width,
    height,
    getContext: jest.fn().mockReturnValue({
      drawImage: jest.fn(),
    }),
    convertToBlob: jest.fn().mockResolvedValue(new Blob()),
  };
  return canvas;
});

global.createImageBitmap = jest.fn().mockResolvedValue({
  width: 1280,
  height: 800,
});

// Mock FileReader with required constants
const MockFileReader = jest.fn().mockImplementation(() => {
  const reader: any = {
    readAsDataURL: jest.fn(),
    onload: null,
    onerror: null,
    result: null,
  };
  
  reader.readAsDataURL.mockImplementation(() => {
    // Simulate async behavior and trigger onload
    setTimeout(() => {
      reader.result = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      if (reader.onload) {
        reader.onload();
      }
    }, 0);
  });
  
  return reader;
});

// Add static properties to the mock
(MockFileReader as any).EMPTY = 0;
(MockFileReader as any).LOADING = 1;
(MockFileReader as any).DONE = 2;

global.FileReader = MockFileReader as any;

// Mock fetch for stitching functionality
global.fetch = jest.fn().mockResolvedValue({
  blob: jest.fn().mockResolvedValue(new Blob()),
});

// Mock the browser API completely
const mockBrowser = {
  tabs: {
    create: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
    get: jest.fn(),
    executeScript: jest.fn(),
    sendMessage: jest.fn(),
    move: jest.fn(),
    update: jest.fn(),
    captureVisibleTab: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
  windows: {
    get: jest.fn(),
  },
  history: {
    search: jest.fn(),
  },
  find: {
    find: jest.fn(),
    highlightResults: jest.fn(),
  },
  storage: {
    local: {
        get: jest.fn(),
    },
  }
};

// Override the global browser object
Object.defineProperty(global, 'browser', {
  value: mockBrowser,
  writable: true,
  configurable: true,
});

// Export for use in tests
export { mockBrowser };
