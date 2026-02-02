/**
 * Orchestrator Module
 *
 * Manages task execution, state transitions, and per-channel queues.
 * Decouples Gateway from direct task processing logic.
 */

export { TaskOrchestrator } from "./TaskOrchestrator.js";
export { TaskRegistry } from "./TaskRegistry.js";
export { PerChannelQueue } from "./PerChannelQueue.js";
export { ApprovalFlowCoordinator } from "./ApprovalFlowCoordinator.js";
export { SessionTaskMapper } from "./SessionTaskMapper.js";
export {
  type TaskState,
  type Task,
  type TaskError,
  type TaskEvent,
  type CreateTaskParams,
  type TaskResult,
} from "./types.js";
export type { PendingApproval } from "./ApprovalFlowCoordinator.js";
