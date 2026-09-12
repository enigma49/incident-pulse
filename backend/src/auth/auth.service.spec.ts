import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../users/schemas/user.schema';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<Partial<UsersService>>;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let configService: any;

  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'operator@example.com',
    name: 'Operator',
    role: UserRole.OPERATOR,
    passwordHash: '',
    isActive: true,
    teamId: '507f1f77bcf86cd799439012',
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('Operator123!', 10);
  });

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string, defaultVal?: any) => defaultVal) as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      const result = await authService.validateUser('operator@example.com', 'Operator123!');
      expect(result).toBeDefined();
      expect(result.email).toBe(mockUser.email);
    });

    it('should return null when password does not match', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      const result = await authService.validateUser('operator@example.com', 'WrongPassword!');
      expect(result).toBeNull();
    });

    it('should return null when user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await authService.validateUser('nonexistent@example.com', 'AnyPass123!');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return tokens and user profile on successful authentication', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      const result = await authService.login({
        email: 'operator@example.com',
        password: 'Operator123!',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toEqual({
        id: mockUser._id,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
        teamId: mockUser.teamId,
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'invalid@example.com',
          password: 'BadPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user account is deactivated', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      usersService.findByEmail.mockResolvedValue(inactiveUser as any);

      await expect(
        authService.login({
          email: 'operator@example.com',
          password: 'Operator123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should rotate access and refresh tokens when valid', async () => {
      jwtService.verify.mockReturnValue({ sub: mockUser._id });
      usersService.findById.mockResolvedValue(mockUser as any);

      const result = await authService.refreshToken({
        refreshToken: 'valid-refresh-token',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.id).toBe(mockUser._id);
    });

    it('should throw UnauthorizedException when token verification fails', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        authService.refreshToken({ refreshToken: 'expired-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

