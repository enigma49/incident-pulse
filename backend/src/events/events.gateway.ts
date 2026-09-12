import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients = new Set<string>();

  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
    this.logger.log(`[Socket.IO] Client connected: ${client.id} (Active: ${this.connectedClients.size})`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`[Socket.IO] Client disconnected: ${client.id} (Active: ${this.connectedClients.size})`);
  }

  @SubscribeMessage('join:incident')
  handleJoinIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ) {
    const room = `incident:${data.incidentId}`;
    client.join(room);
    this.logger.debug(`[Socket.IO] Socket ${client.id} joined room: ${room}`);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave:incident')
  handleLeaveIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ) {
    const room = `incident:${data.incidentId}`;
    client.leave(room);
    this.logger.debug(`[Socket.IO] Socket ${client.id} left room: ${room}`);
    return { event: 'left', room };
  }

  @SubscribeMessage('join:dashboard')
  handleJoinDashboard(@ConnectedSocket() client: Socket) {
    const room = 'dashboard';
    client.join(room);
    this.logger.debug(`[Socket.IO] Socket ${client.id} joined room: ${room}`);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave:dashboard')
  handleLeaveDashboard(@ConnectedSocket() client: Socket) {
    const room = 'dashboard';
    client.leave(room);
    this.logger.debug(`[Socket.IO] Socket ${client.id} left room: ${room}`);
    return { event: 'left', room };
  }

  // Broadcast Helpers

  emitIncidentCreated(incident: any) {
    this.logger.log(`[Realtime Event] incident:created broadcast to room 'dashboard' (ID: ${incident._id})`);
    if (this.server) {
      this.server.to('dashboard').emit('incident:created', incident);
    }
  }

  emitIncidentUpdated(incident: any) {
    const id = incident._id.toString();
    this.logger.log(`[Realtime Event] incident:updated broadcast to room 'incident:${id}' & 'dashboard'`);
    if (this.server) {
      this.server.to(`incident:${id}`).emit('incident:updated', incident);
      this.server.to('dashboard').emit('incident:updated', incident);
    }
  }

  emitIncidentStatusChanged(incident: any) {
    const id = incident._id.toString();
    this.logger.log(`[Realtime Event] incident:status_changed broadcast to room 'incident:${id}' & 'dashboard' (${incident.status})`);
    if (this.server) {
      this.server.to(`incident:${id}`).emit('incident:status_changed', incident);
      this.server.to('dashboard').emit('incident:status_changed', incident);
    }
  }

  emitIncidentSeverityChanged(incident: any) {
    const id = incident._id.toString();
    this.logger.log(`[Realtime Event] incident:severity_changed broadcast to room 'incident:${id}' & 'dashboard' (${incident.severity})`);
    if (this.server) {
      this.server.to(`incident:${id}`).emit('incident:severity_changed', incident);
      this.server.to('dashboard').emit('incident:severity_changed', incident);
    }
  }

  emitIncidentAssigned(incident: any) {
    const id = incident._id.toString();
    this.logger.log(`[Realtime Event] incident:assigned broadcast to room 'incident:${id}' & 'dashboard'`);
    if (this.server) {
      this.server.to(`incident:${id}`).emit('incident:assigned', incident);
      this.server.to('dashboard').emit('incident:assigned', incident);
    }
  }

  emitCommentCreated(incidentId: string, comment: any) {
    this.logger.log(`[Realtime Event] comment:created broadcast to room 'incident:${incidentId}'`);
    if (this.server) {
      this.server.to(`incident:${incidentId}`).emit('comment:created', comment);
    }
  }

  emitTaskCreated(incidentId: string, task: any) {
    this.logger.log(`[Realtime Event] task:created broadcast to room 'incident:${incidentId}'`);
    if (this.server) {
      this.server.to(`incident:${incidentId}`).emit('task:created', task);
    }
  }

  emitTaskUpdated(incidentId: string, task: any) {
    this.logger.log(`[Realtime Event] task:updated broadcast to room 'incident:${incidentId}'`);
    if (this.server) {
      this.server.to(`incident:${incidentId}`).emit('task:updated', task);
    }
  }

  emitTaskDeleted(incidentId: string, taskId: string) {
    this.logger.log(`[Realtime Event] task:deleted broadcast to room 'incident:${incidentId}'`);
    if (this.server) {
      this.server.to(`incident:${incidentId}`).emit('task:deleted', { taskId });
    }
  }

  emitAlertAssociated(incidentId: string, alert: any) {
    this.logger.log(`[Realtime Event] alert:associated broadcast to room 'incident:${incidentId}' & 'dashboard'`);
    if (this.server) {
      this.server.to(`incident:${incidentId}`).emit('alert:associated', alert);
      this.server.to('dashboard').emit('alert:associated', alert);
    }
  }

  emitAIInvestigationEvent(incidentId: string, eventType: string, payload: any) {
    this.logger.log(`[Realtime Event] ai:investigation_event [${eventType}] to room 'incident:${incidentId}'`);
    if (this.server) {
      this.server.to(`incident:${incidentId}`).emit('ai:investigation_event', {
        type: eventType,
        data: payload,
      });
    }
  }
}

