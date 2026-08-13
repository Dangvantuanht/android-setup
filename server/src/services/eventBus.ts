import { EventEmitter } from "node:events";

export type SessionChangeEvent = {
  sessionId: string;
  status: string;
};

export const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(0);

export function emitSessionChange(event: SessionChangeEvent): void {
  sessionEvents.emit("change", event);
}
