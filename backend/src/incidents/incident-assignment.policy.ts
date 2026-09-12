import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/schemas/user.schema';

export interface AssignmentActor {
  userId?: string;
  role?: string;
}

export interface AssignmentFields {
  assigneeId?: string | null;
  teamId?: string | null;
}

/**
 * Operators may only self-assign or unassign themselves, and cannot set/change team.
 * Admins (and system actors without OPERATOR role) are unrestricted.
 */
export function assertOperatorAssignmentAllowed(
  actor: AssignmentActor | null | undefined,
  fields: AssignmentFields,
  options: {
    context: 'create' | 'update' | 'assign';
    currentAssigneeId?: string | null;
  },
): void {
  if (!actor || actor.role !== UserRole.OPERATOR) {
    return;
  }

  const selfId = actor.userId;

  if (fields.teamId !== undefined) {
    throw new ForbiddenException(
      'Operators are not allowed to set or change the assigned team',
    );
  }

  if (fields.assigneeId === undefined) {
    return;
  }

  if (options.context === 'create') {
    throw new ForbiddenException(
      'Operators are not allowed to set assignee or team when creating an incident',
    );
  }

  const requested =
    fields.assigneeId === null || fields.assigneeId === ''
      ? null
      : String(fields.assigneeId);

  if (requested === null) {
    const current = options.currentAssigneeId
      ? String(options.currentAssigneeId)
      : null;
    if (!selfId || current !== selfId) {
      throw new ForbiddenException(
        'Operators can only unassign an incident when they are the current assignee',
      );
    }
    return;
  }

  if (!selfId || requested !== selfId) {
    throw new ForbiddenException(
      'Operators can only assign incidents to themselves',
    );
  }
}
