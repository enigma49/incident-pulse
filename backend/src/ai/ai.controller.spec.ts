import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

describe('AIController - Phase 7 Human-in-the-loop Action Endpoints & Authorization', () => {
  let controller: AIController;
  let aiService: any;
  let reflector: Reflector;

  beforeEach(async () => {
    aiService = {
      startInvestigation: jest.fn(),
      getLatestInvestigation: jest.fn(),
      getInvestigationHistory: jest.fn(),
      approveAction: jest.fn().mockResolvedValue({ success: true, message: 'Action executed' }),
      rejectAction: jest.fn().mockResolvedValue({ success: true, message: 'Action rejected' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AIController],
      providers: [
        { provide: AIService, useValue: aiService },
        Reflector,
      ],
    }).compile();

    controller = module.get<AIController>(AIController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Route Authorization Metadata', () => {
    it('should restrict approve action endpoints to ADMIN and OPERATOR roles', () => {
      const approveRoles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.approveLatestAction,
      );
      expect(approveRoles).toEqual([UserRole.ADMIN, UserRole.OPERATOR]);

      const approveSpecificRoles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.approveSpecificAction,
      );
      expect(approveSpecificRoles).toEqual([UserRole.ADMIN, UserRole.OPERATOR]);
    });

    it('should restrict reject action endpoints to ADMIN and OPERATOR roles', () => {
      const rejectRoles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.rejectLatestAction,
      );
      expect(rejectRoles).toEqual([UserRole.ADMIN, UserRole.OPERATOR]);

      const rejectSpecificRoles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.rejectSpecificAction,
      );
      expect(rejectSpecificRoles).toEqual([UserRole.ADMIN, UserRole.OPERATOR]);
    });
  });

  describe('Controller Execution Routing', () => {
    const mockUser = { userId: 'u1', email: 'op@example.com', role: UserRole.OPERATOR };

    it('should route approveLatestAction to AIService.approveAction without investigationId', async () => {
      const result = await controller.approveLatestAction('inc-1', { force: false }, { user: mockUser });
      expect(result.success).toBe(true);
      expect(aiService.approveAction).toHaveBeenCalledWith('inc-1', mockUser, undefined, { force: false });
    });

    it('should route approveSpecificAction to AIService.approveAction with investigationId', async () => {
      const result = await controller.approveSpecificAction('inc-1', 'inv-99', { force: true }, { user: mockUser });
      expect(result.success).toBe(true);
      expect(aiService.approveAction).toHaveBeenCalledWith('inc-1', mockUser, 'inv-99', { force: true });
    });

    it('should route rejectLatestAction to AIService.rejectAction', async () => {
      const result = await controller.rejectLatestAction('inc-1', { reason: 'Unnecessary' }, { user: mockUser });
      expect(result.success).toBe(true);
      expect(aiService.rejectAction).toHaveBeenCalledWith('inc-1', mockUser, { reason: 'Unnecessary' }, undefined);
    });

    it('should route rejectSpecificAction to AIService.rejectAction with investigationId', async () => {
      const result = await controller.rejectSpecificAction('inc-1', 'inv-99', { reason: 'Deferred' }, { user: mockUser });
      expect(result.success).toBe(true);
      expect(aiService.rejectAction).toHaveBeenCalledWith('inc-1', mockUser, { reason: 'Deferred' }, 'inv-99');
    });
  });
});

