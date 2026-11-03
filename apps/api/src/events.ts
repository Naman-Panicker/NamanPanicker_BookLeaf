// Live updates (ticket 12) fill in the event types and send them to connected browsers.
export type AppEvent = {
  type: string;
  payload: unknown;
};

export type EventPublisher = {
  publish(event: AppEvent): void;
};

export const noopPublisher: EventPublisher = { publish: () => {} };
