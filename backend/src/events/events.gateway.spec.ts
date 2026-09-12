import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { Server, Socket } from 'socket.io';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockServer: any;
  let mockSocket: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);

    const emitFn = jest.fn();
    mockServer = {
      to: jest.fn().mockReturnValue({ emit: emitFn }),
      emit: emitFn,
    };
    gateway.server = mockServer as unknown as Server;

    mockSocket = {
      id: 'socket_test_123',
      join: jest.fn(),
      leave: jest.fn(),
    } as unknown as Socket;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should handle connection and disconnection', () => {
    gateway.handleConnection(mockSocket);
    gateway.handleDisconnect(mockSocket);
    // Should log and track without throwing
  });

  describe('Rooms management', () => {
    it('should join incident room', () => {
      const result = gateway.handleJoinIncident(mockSocket, { incidentId: 'inc-123' });
      expect(mockSocket.join).toHaveBeenCalledWith('incident:inc-123');
      expect(result).toEqual({ event: 'joined', room: 'incident:inc-123' });
    });

    it('should leave incident room', () => {
      const result = gateway.handleLeaveIncident(mockSocket, { incidentId: 'inc-123' });
      expect(mockSocket.leave).toHaveBeenCalledWith('incident:inc-123');
      expect(result).toEqual({ event: 'left', room: 'incident:inc-123' });
    });

    it('should join dashboard room', () => {
      const result = gateway.handleJoinDashboard(mockSocket);
      expect(mockSocket.join).toHaveBeenCalledWith('dashboard');
      expect(result).toEqual({ event: 'joined', room: 'dashboard' });
    });

    it('should leave dashboard room', () => {
      const result = gateway.handleLeaveDashboard(mockSocket);
      expect(mockSocket.leave).toHaveBeenCalledWith('dashboard');
      expect(result).toEqual({ event: 'left', room: 'dashboard' });
    });
  });

  describe('Realtime broadcasts', () => {
    it('should broadcast emitIncidentCreated to dashboard', () => {
      const incident = { _id: 'inc-1', title: 'DB Outage' };
      gateway.emitIncidentCreated(incident);
      expect(mockServer.to).toHaveBeenCalledWith('dashboard');
    });

    it('should broadcast emitIncidentStatusChanged to incident room and dashboard', () => {
      const incident = { _id: 'inc-2', status: 'INVESTIGATING' };
      gateway.emitIncidentStatusChanged(incident);
      expect(mockServer.to).toHaveBeenCalledWith('incident:inc-2');
      expect(mockServer.to).toHaveBeenCalledWith('dashboard');
    });

    it('should broadcast emitCommentCreated to incident room', () => {
      const comment = { _id: 'comm-1', content: 'Checking logs' };
      gateway.emitCommentCreated('inc-3', comment);
      expect(mockServer.to).toHaveBeenCalledWith('incident:inc-3');
    });

    it('should broadcast emitTaskCreated to incident room', () => {
      const task = { _id: 'task-1', title: 'Restart cluster' };
      gateway.emitTaskCreated('inc-4', task);
      expect(mockServer.to).toHaveBeenCalledWith('incident:inc-4');
    });

    it('should broadcast emitTaskDeleted to incident room', () => {
      gateway.emitTaskDeleted('inc-4', 'task-1');
      expect(mockServer.to).toHaveBeenCalledWith('incident:inc-4');
    });

    it('should broadcast emitAlertAssociated to incident room and dashboard', () => {
      const alert = { _id: 'alt-1', title: 'High CPU' };
      gateway.emitAlertAssociated('inc-5', alert);
      expect(mockServer.to).toHaveBeenCalledWith('incident:inc-5');
      expect(mockServer.to).toHaveBeenCalledWith('dashboard');
    });

    it('should broadcast emitAIInvestigationEvent to incident room', () => {
      gateway.emitAIInvestigationEvent('inc-6', 'TOOL_CALLED', { tool: 'query_logs' });
      expect(mockServer.to).toHaveBeenCalledWith('incident:inc-6');
    });
  });
});

