import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddDonationsCreatedAtIndex1743260400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'donations',
      new TableIndex({
        name: 'IDX_donations_created_at',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('donations', 'IDX_donations_created_at');
  }
}
