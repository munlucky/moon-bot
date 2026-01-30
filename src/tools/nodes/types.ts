// Node Tool Types

/**
 * Node connection status
 */
export type NodeConnectionStatus = "paired" | "pending" | "offline" | "expired";

/**
 * Node information
 */
export interface NodeInfo {
  nodeId: string;
  nodeName: string;
  status: NodeConnectionStatus;
  lastSeen: number;
  platform?: string;
}

/**
 * Node connection details
 */
export interface NodeConnection {
  nodeId: string;
  socketId: string;
  userId: string;
  nodeName: string;
  platform: string;
  capabilities: {
    screenCapture: boolean;
    commandExec: boolean;
  };
  screenCaptureConsent: {
    granted: boolean;
    grantedAt?: number;
    expiresAt?: number;
  };
  status: NodeConnectionStatus;
  pairedAt: number;
  lastSeen: number;
}
