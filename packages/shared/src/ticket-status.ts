import type { Role } from './session';
import type { TicketStatus } from './tickets';

export type TicketAction =
  | { type: 'SEND_MESSAGE' }
  | { type: 'CONFIRM_RESOLUTION' }
  | { type: 'ASSIGN' }
  | { type: 'SET_STATUS'; status: TicketStatus };

export type TransitionRejection = 'TICKET_CLOSED' | 'NOT_RESOLVED' | 'ROLE_NOT_ALLOWED';

export type TransitionResult = { ok: true; status: TicketStatus } | { ok: false; rejection: TransitionRejection };

function moveTo(status: TicketStatus): TransitionResult {
  return { ok: true, status };
}

function reject(rejection: TransitionRejection): TransitionResult {
  return { ok: false, rejection };
}

function afterMessage(status: TicketStatus, role: Role) {
  if (status === 'CLOSED') return reject('TICKET_CLOSED');
  if (role === 'ADMIN' && status === 'OPEN') return moveTo('IN_PROGRESS');
  if (role === 'AUTHOR' && status === 'RESOLVED') return moveTo('IN_PROGRESS');
  return moveTo(status);
}

function afterConfirmation(status: TicketStatus, role: Role) {
  if (role !== 'AUTHOR') return reject('ROLE_NOT_ALLOWED');
  return status === 'RESOLVED' ? moveTo('CLOSED') : reject('NOT_RESOLVED');
}

function afterAssignment(status: TicketStatus, role: Role) {
  if (role !== 'ADMIN') return reject('ROLE_NOT_ALLOWED');
  return moveTo(status === 'OPEN' ? 'IN_PROGRESS' : status);
}

export function nextTicketStatus(status: TicketStatus, role: Role, action: TicketAction): TransitionResult {
  switch (action.type) {
    case 'SEND_MESSAGE':
      return afterMessage(status, role);
    case 'CONFIRM_RESOLUTION':
      return afterConfirmation(status, role);
    case 'ASSIGN':
      return afterAssignment(status, role);
    case 'SET_STATUS':
      return role === 'ADMIN' ? moveTo(action.status) : reject('ROLE_NOT_ALLOWED');
  }
}
