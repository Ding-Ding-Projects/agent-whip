import type { AgentWhipBridge } from '../shared/ipc-contracts.ts';

declare global {
  interface Window {
    agentWhip: AgentWhipBridge;
  }
}

export {};
