import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { AuthRepository } from './auth.repository.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { AuthErrorCode } from './constants/auth-error-codes.js';
import type { Principal } from '../../common/interfaces/principal.interface.js';
import type { UserDocument } from './schemas/user.schema.js';
import {
  BCRYPT_ROUNDS,
  JWT_ACCESS_TTL,
  JWT_REFRESH_TTL,
} from '../../common/constants/security.js';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface UserPlainObject {
  password?: string;
  refreshToken?: string;
  twoFactorSecret?: string;
  loginAttempts?: number;
  lockUntil?: Date;
  [key: string]: unknown;
}

@Injectable()
export class AuthService {
  private readonly authMode: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.authMode = this.configService
      .get<string>('AUTH_MODE', 'session')
      .toLowerCase();
  }

  async login(
    loginDto: LoginDto,
    req: Request,
  ): Promise<Record<string, unknown>> {
    const user = await this.authRepository.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: AuthErrorCode.ACCOUNT_DISABLED,
        message: 'Account has been disabled. Please contact support.',
      });
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60_000);
      throw new ForbiddenException({
        code: AuthErrorCode.ACCOUNT_LOCKED,
        message: `Account is locked. Try again in ${remainingMin} minute(s).`,
      });
    }

    const isPasswordValid = await user.comparePassword(loginDto.password);

    if (!isPasswordValid) {
      await this.authRepository.incrementLoginAttempts(user._id.toString());
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    const userId = user._id.toString();
    await this.authRepository.resetLoginAttempts(userId);
    await this.authRepository.updateLastLogin(userId);

    const principal = this.buildPrincipal(user);

    if (this.authMode === 'jwt') {
      const tokens = await this.generateTokens(principal);
      const hashedRefresh = await bcrypt.hash(
        tokens.refreshToken,
        BCRYPT_ROUNDS,
      );
      await this.authRepository.updateRefreshToken(userId, hashedRefresh);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: principal,
      };
    }

    // Session mode
    req.session.principal = principal;

    return { user: principal };
  }

  async register(registerDto: RegisterDto): Promise<Record<string, unknown>> {
    const existing = await this.authRepository.findByEmail(registerDto.email);
    if (existing) {
      throw new ConflictException({
        code: AuthErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'Email is already registered',
      });
    }

    const user = await this.authRepository.createUser({
      email: registerDto.email,
      password: registerDto.password,
      fullName: registerDto.fullName,
    });

    const plainUser = user.toObject() as unknown as UserPlainObject;
    delete plainUser.password;
    delete plainUser.refreshToken;
    delete plainUser.twoFactorSecret;

    return plainUser;
  }

  async logout(req: Request): Promise<void> {
    if (this.authMode === 'jwt') {
      const principal =
        (req as Request & { principal?: Principal; user?: Principal })
          .principal ?? (req as Request & { user?: Principal }).user;
      if (principal) {
        await this.authRepository.updateRefreshToken(principal.userId, null);
      }
      return;
    }

    // Session mode
    return new Promise<void>((resolve, reject) => {
      req.session.destroy((err: Error | undefined) => {
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'User not found',
      });
    }

    const isCurrentValid = await user.comparePassword(dto.currentPassword);
    if (!isCurrentValid) {
      throw new BadRequestException({
        code: AuthErrorCode.CURRENT_PASSWORD_INCORRECT,
        message: 'Current password is incorrect',
      });
    }

    // DTO validators already enforce newPassword !== currentPassword
    // and confirmPassword === newPassword, but double-check here
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException({
        code: AuthErrorCode.PASSWORD_MISMATCH,
        message: 'New password must be different from the current password',
      });
    }

    if (dto.confirmPassword !== dto.newPassword) {
      throw new BadRequestException({
        code: AuthErrorCode.PASSWORD_MISMATCH,
        message: 'Confirm password does not match new password',
      });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hashedPassword = await bcrypt.hash(dto.newPassword, salt);

    await this.authRepository.updateUser(userId, {
      password: hashedPassword,
    });
  }

  async refreshToken(
    refreshTokenValue: string,
  ): Promise<Record<string, unknown>> {
    if (this.authMode !== 'jwt') {
      throw new BadRequestException({
        code: AuthErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Refresh tokens are only supported in JWT mode',
      });
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshTokenValue, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: AuthErrorCode.REFRESH_TOKEN_EXPIRED,
        message: 'Refresh token is expired or invalid',
      });
    }

    const userId: string = payload.sub;
    const user = await this.authRepository.findById(userId);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException({
        code: AuthErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Refresh token is invalid',
      });
    }

    const isTokenValid = await bcrypt.compare(
      refreshTokenValue,
      user.refreshToken,
    );
    if (!isTokenValid) {
      throw new UnauthorizedException({
        code: AuthErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Refresh token is invalid',
      });
    }

    const principal = this.buildPrincipal(user);
    const tokens = await this.generateTokens(principal);

    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS);
    await this.authRepository.updateRefreshToken(userId, hashedRefresh);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'User not found',
      });
    }

    const plainUser = user.toObject() as unknown as UserPlainObject;
    delete plainUser.password;
    delete plainUser.refreshToken;
    delete plainUser.twoFactorSecret;
    delete plainUser.loginAttempts;
    delete plainUser.lockUntil;

    return plainUser;
  }

  private buildPrincipal(user: UserDocument): Principal {
    return {
      userId: user._id.toString(),
      email: user.email,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
    };
  }

  private async generateTokens(
    principal: Principal,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtPayload: JwtPayload = {
      sub: principal.userId,
      email: principal.email,
      roles: principal.roles,
      permissions: principal.permissions,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: JWT_ACCESS_TTL,
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: JWT_REFRESH_TTL,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
