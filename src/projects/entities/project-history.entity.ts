import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from './project.entity';
import { ProjectStatus } from 'src/common/enums/project-status.enum';

@Entity('project_history')
export class ProjectHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ProjectStatus })
  previousStatus: ProjectStatus;

  @Column({ type: 'enum', enum: ProjectStatus })
  newStatus: ProjectStatus;

  @Column({ nullable: true, type: 'text' })
  reason: string | null;

  @Column({ nullable: true, type: 'text' })
  adminNotes: string | null;

  @Column({ default: false })
  isAdminAction: boolean;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  changedBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changedBy' })
  changedByUser: User;

  @CreateDateColumn()
  changedAt: Date;
}
