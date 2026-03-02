import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { AuthUser, LoginResponse } from '@shiftsync/shared-types';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<AuthUser | null> {
    const user = (await this.prisma.db.user.findUnique({
      where: { email },
    })) as User | null;

    if (!user) {
      this.logger.warn(`Authentication failed for email: ${email}`);
      return null;
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      this.logger.warn(`Authentication failed for email: ${email}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result as AuthUser;
  }

  async login(user: AuthUser): Promise<LoginResponse> {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { id: user.id },
      select: { certifiedLocations: true },
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        ...user,
        certifiedLocations: dbUser?.certifiedLocations || [],
      },
    };
  }
}
