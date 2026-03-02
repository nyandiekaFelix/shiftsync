import { Injectable } from '@nestjs/common';
import {
  ShiftSyncEvent,
  ShiftRealtimeEvent,
  StaffAssignmentRealtimeEvent,
} from '@shiftsync/shared-types';
import { EventsGateway } from './events.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly eventsGateway: EventsGateway) {}

  emitShiftUpdated(locationId: string, shiftId: string): void {
    const payload: ShiftRealtimeEvent = {
      event: ShiftSyncEvent.SHIFT_UPDATED,
      shiftId,
      locationId,
      occurredAt: new Date().toISOString(),
    };

    this.eventsGateway.emitToLocation(
      locationId,
      ShiftSyncEvent.SHIFT_UPDATED,
      payload,
    );
  }

  emitSchedulePublished(locationId: string, shiftId: string): void {
    const payload: ShiftRealtimeEvent = {
      event: ShiftSyncEvent.SCHEDULE_PUBLISHED,
      shiftId,
      locationId,
      occurredAt: new Date().toISOString(),
    };

    this.eventsGateway.emitToLocation(
      locationId,
      ShiftSyncEvent.SCHEDULE_PUBLISHED,
      payload,
    );
  }

  emitAssignmentCreated(
    locationId: string,
    shiftId: string,
    staffId: string,
    assignmentId: string,
  ): void {
    const managerPayload: StaffAssignmentRealtimeEvent = {
      event: ShiftSyncEvent.SHIFT_ASSIGNMENT_CREATED,
      shiftId,
      locationId,
      staffId,
      assignmentId,
      occurredAt: new Date().toISOString(),
    };

    this.eventsGateway.emitToLocation(
      locationId,
      ShiftSyncEvent.SHIFT_ASSIGNMENT_CREATED,
      managerPayload,
    );

    this.eventsGateway.emitToUser(
      staffId,
      ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
      {
        ...managerPayload,
        event: ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
      } satisfies StaffAssignmentRealtimeEvent,
    );
  }

  emitAssignmentRemoved(
    locationId: string,
    shiftId: string,
    staffId: string,
  ): void {
    const managerPayload: StaffAssignmentRealtimeEvent = {
      event: ShiftSyncEvent.SHIFT_ASSIGNMENT_REMOVED,
      shiftId,
      locationId,
      staffId,
      occurredAt: new Date().toISOString(),
    };

    this.eventsGateway.emitToLocation(
      locationId,
      ShiftSyncEvent.SHIFT_ASSIGNMENT_REMOVED,
      managerPayload,
    );

    this.eventsGateway.emitToUser(
      staffId,
      ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
      {
        ...managerPayload,
        event: ShiftSyncEvent.STAFF_ASSIGNMENT_UPDATED,
      } satisfies StaffAssignmentRealtimeEvent,
    );
  }

  emitSwapRequestUpdated(locationId: string, requestId: string): void {
    const payload = {
      event: ShiftSyncEvent.SWAP_REQUEST_UPDATED,
      requestId,
      locationId,
      occurredAt: new Date().toISOString(),
    };

    this.eventsGateway.emitToLocation(
      locationId,
      ShiftSyncEvent.SWAP_REQUEST_UPDATED,
      payload,
    );
  }
}
