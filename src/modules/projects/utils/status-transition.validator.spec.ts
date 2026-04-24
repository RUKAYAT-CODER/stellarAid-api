import { ProjectStatus } from '../../../generated/prisma';
import { validateStatusTransition, canTransitionTo, isProjectAcceptingDonations, isProjectCompleted } from './status-transition.validator';
import { BadRequestException } from '@nestjs/common';

describe('Status Transition Validator', () => {
  describe('validateStatusTransition', () => {
    it('should allow valid transitions', () => {
      expect(() => validateStatusTransition(ProjectStatus.PENDING, ProjectStatus.APPROVED)).not.toThrow();
      expect(() => validateStatusTransition(ProjectStatus.APPROVED, ProjectStatus.ACTIVE)).not.toThrow();
      expect(() => validateStatusTransition(ProjectStatus.ACTIVE, ProjectStatus.PAUSED)).not.toThrow();
      expect(() => validateStatusTransition(ProjectStatus.PAUSED, ProjectStatus.ACTIVE)).not.toThrow();
      expect(() => validateStatusTransition(ProjectStatus.ACTIVE, ProjectStatus.COMPLETED)).not.toThrow();
    });

    it('should reject invalid transition when trying to change from same status', () => {
      expect(() => validateStatusTransition(ProjectStatus.ACTIVE, ProjectStatus.ACTIVE)).toThrow(BadRequestException);
    });

    it('should reject invalid transitions', () => {
      expect(() => validateStatusTransition(ProjectStatus.PENDING, ProjectStatus.PAUSED)).toThrow(BadRequestException);
      expect(() => validateStatusTransition(ProjectStatus.COMPLETED, ProjectStatus.ACTIVE)).toThrow(BadRequestException);
      expect(() => validateStatusTransition(ProjectStatus.REJECTED, ProjectStatus.ACTIVE)).toThrow(BadRequestException);
    });
  });

  describe('canTransitionTo', () => {
    it('should return true for valid transitions', () => {
      expect(canTransitionTo(ProjectStatus.ACTIVE, ProjectStatus.PAUSED)).toBe(true);
      expect(canTransitionTo(ProjectStatus.PAUSED, ProjectStatus.ACTIVE)).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(canTransitionTo(ProjectStatus.COMPLETED, ProjectStatus.ACTIVE)).toBe(false);
      expect(canTransitionTo(ProjectStatus.PENDING, ProjectStatus.PAUSED)).toBe(false);
    });
  });

  describe('isProjectAcceptingDonations', () => {
    it('should return true only for ACTIVE status', () => {
      expect(isProjectAcceptingDonations(ProjectStatus.ACTIVE)).toBe(true);
      expect(isProjectAcceptingDonations(ProjectStatus.PAUSED)).toBe(false);
      expect(isProjectAcceptingDonations(ProjectStatus.COMPLETED)).toBe(false);
      expect(isProjectAcceptingDonations(ProjectStatus.PENDING)).toBe(false);
    });
  });

  describe('isProjectCompleted', () => {
    it('should return true for COMPLETED and REJECTED statuses', () => {
      expect(isProjectCompleted(ProjectStatus.COMPLETED)).toBe(true);
      expect(isProjectCompleted(ProjectStatus.REJECTED)).toBe(true);
      expect(isProjectCompleted(ProjectStatus.ACTIVE)).toBe(false);
      expect(isProjectCompleted(ProjectStatus.PAUSED)).toBe(false);
    });
  });
});
