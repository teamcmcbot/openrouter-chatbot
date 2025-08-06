// Mock for isows
const mockWebSocket = {
  WebSocket: class MockWebSocket {
    constructor() {
      this.readyState = 1;
    }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  },
};

export default mockWebSocket;
