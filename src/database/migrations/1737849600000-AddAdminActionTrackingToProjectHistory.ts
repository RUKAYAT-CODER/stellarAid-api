import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAdminActionTrackingToProjectHistory1737849600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add adminNotes column
    await queryRunner.addColumn(
      'project_history',
      new TableColumn({
        name: 'adminNotes',
        type: 'text',
        isNullable: true,
      }),
    );

    // Add isAdminAction column
    await queryRunner.addColumn(
      'project_history',
      new TableColumn({
        name: 'isAdminAction',
        type: 'boolean',
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop isAdminAction column
    await queryRunner.dropColumn('project_history', 'isAdminAction');

    // Drop adminNotes column
    await queryRunner.dropColumn('project_history', 'adminNotes');
  }
}
