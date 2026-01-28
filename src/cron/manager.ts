// Cron Manager: Schedule and execute periodic tasks

import { createLogger, type Logger } from "../utils/logger.js";
import type { SystemConfig, CronJob, ChatMessage } from "../types/index.js";

export class CronManager {
  private config: SystemConfig;
  private logger: Logger;
  private jobs = new Map<string, CronJob>();
  private intervals = new Map<string, NodeJS.Timeout>();

  constructor(config: SystemConfig) {
    this.config = config;
    this.logger = createLogger(config);
  }

  add(job: CronJob): void {
    this.jobs.set(job.id, job);
    this.logger.info(`Cron job added: ${job.id}`);

    if (job.enabled) {
      this.start(job.id);
    }
  }

  remove(jobId: string): void {
    this.stop(jobId);
    this.jobs.delete(jobId);
    this.logger.info(`Cron job removed: ${jobId}`);
  }

  start(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (this.intervals.has(jobId)) {
      return; // Already running
    }

    // Schedule the first run
    this.scheduleNextRun(jobId, job);
    this.logger.info(`Cron job started: ${jobId}`);
  }

  /**
   * Schedule the next run for a cron job.
   * Calculates initial delay and sets up recurring daily execution.
   */
  private scheduleNextRun(jobId: string, job: CronJob): void {
    const initialDelay = this.parseInterval(job.schedule);

    // First run after initial delay
    const timeout = setTimeout(() => {
      this.executeJob(job);

      // Then schedule to run every 24 hours (daily)
      const dailyInterval = setInterval(() => {
        this.executeJob(job);
      }, 24 * 60 * 60 * 1000); // 24 hours

      // Replace the timeout reference with the interval
      this.intervals.set(jobId, dailyInterval as unknown as NodeJS.Timeout);
    }, initialDelay);

    this.intervals.set(jobId, timeout);
  }

  stop(jobId: string): void {
    const interval = this.intervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(jobId);
      this.logger.info(`Cron job stopped: ${jobId}`);
    }
  }

  private parseInterval(schedule: string): number {
    // Simple parser for "HH:MM" format
    const match = schedule.match(/(\d{2}):(\d{2})/);
    if (!match) {
      return 60 * 60 * 1000; // Default 1 hour
    }

    const [, hour, minute] = match;
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);

    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);

    if (target < now) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  private async executeJob(job: CronJob): Promise<void> {
    this.logger.info(`Executing cron job: ${job.id}`);

    // TODO: Send task to agent
    // For now, just log
    this.logger.info(`Cron task: ${job.task.text}`);
  }

  list(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  get(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }
}
