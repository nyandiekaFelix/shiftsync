import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@shiftsync/shared-types';
import { Server, Socket } from 'socket.io';
import { getAllowedOrigins } from '../common/cors/cors.config';

interface SocketUser {
  id: string;
  role: Role;
  certifiedLocations: string[];
}

@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<{
        sub: string;
        role: Role;
        certifiedLocations?: string[];
      }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      const user: SocketUser = {
        id: payload.sub,
        role: payload.role,
        certifiedLocations: payload.certifiedLocations ?? [],
      };

      this.setSocketUser(client, user);
      void client.join(this.userRoom(payload.sub));
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(): void {}

  @SubscribeMessage('join.location')
  handleJoinLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { locationId?: string },
  ): void {
    const locationId = body.locationId?.trim();
    if (!locationId) {
      return;
    }

    const user = this.getSocketUser(client);
    if (!user) {
      client.disconnect();
      return;
    }

    if (
      user.role === Role.ADMIN ||
      user.role === Role.MANAGER ||
      user.certifiedLocations.includes(locationId)
    ) {
      void client.join(this.locationRoom(locationId));
    }
  }

  emitToLocation<TPayload>(
    locationId: string,
    event: string,
    payload: TPayload,
  ): void {
    this.server.to(this.locationRoom(locationId)).emit(event, payload);
  }

  emitToUser<TPayload>(userId: string, event: string, payload: TPayload): void {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  locationRoom(locationId: string): string {
    return `location:${locationId}`;
  }

  userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken = auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const authorizationHeader = client.handshake.headers.authorization;
    if (
      typeof authorizationHeader === 'string' &&
      authorizationHeader.startsWith('Bearer ')
    ) {
      return authorizationHeader.slice(7);
    }

    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const tokenCookie = cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('access_token='));

    if (!tokenCookie) {
      return null;
    }

    return decodeURIComponent(tokenCookie.replace('access_token=', ''));
  }

  private setSocketUser(client: Socket, user: SocketUser): void {
    const data = client.data as { user?: SocketUser };
    data.user = user;
  }

  private getSocketUser(client: Socket): SocketUser | undefined {
    const data = client.data as { user?: SocketUser };
    return data.user;
  }
}
