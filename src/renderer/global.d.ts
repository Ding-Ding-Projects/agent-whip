import type { AgentWhipBridge } from '../shared/ipc-contracts.js';

declare global {
  interface Window {
    agentWhip: AgentWhipBridge;
  }
}

export {};
