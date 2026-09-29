import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import {
  emailQueue,
  maintenanceQueue,
  notificationQueue,
} from "../queue/queues.js";

export const BULL_BOARD_PATH = "/admin/queues";

/** Live, read-only view of all queues. Mounted behind login + admin allowlist. */
export function createBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: [emailQueue, notificationQueue, maintenanceQueue].map(
      (queue) => new BullMQAdapter(queue, { readOnlyMode: true }),
    ),
    serverAdapter,
  });
  return serverAdapter.getRouter();
}
