import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  Logger,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'projects',
})
export class ProjectsGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ProjectsGateway.name);

  afterInit(server: Server) {
    this.logger.log('Projects WebSocket Gateway Initialized');
  }

  emitProjectUpdate(projectId: string, data: any) {
    this.server.emit(`project_update_${projectId}`, data);
    this.server.emit('projects_update', { projectId, ...data });
  }
}
