import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateDonationsTable1711382400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'donations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'projectId',
            type: 'uuid',
          },
          {
            name: 'donorId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 7,
          },
          {
            name: 'assetType',
            type: 'varchar',
            default: "'XLM'",
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            isNullable: true,
            isUnique: true,
          },
          {
            name: 'isAnonymous',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'donations',
      new TableIndex({
        name: 'IDX_donations_project_id',
        columnNames: ['projectId'],
      }),
    );

    await queryRunner.createIndex(
      'donations',
      new TableIndex({
        name: 'IDX_donations_transaction_hash',
        columnNames: ['transactionHash'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'donations',
      new TableForeignKey({
        name: 'FK_donations_project',
        columnNames: ['projectId'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'donations',
      new TableForeignKey({
        name: 'FK_donations_donor',
        columnNames: ['donorId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('donations');

    if (table) {
      // Drop foreign keys
      const projectForeignKey = table.foreignKeys.find(
        (fk) => fk.name === 'FK_donations_project',
      );
      if (projectForeignKey) {
        await queryRunner.dropForeignKey('donations', projectForeignKey);
      }

      const donorForeignKey = table.foreignKeys.find(
        (fk) => fk.name === 'FK_donations_donor',
      );
      if (donorForeignKey) {
        await queryRunner.dropForeignKey('donations', donorForeignKey);
      }

      // Drop indexes
      const projectIdIndex = table.indices.find(
        (idx) => idx.name === 'IDX_donations_project_id',
      );
      if (projectIdIndex) {
        await queryRunner.dropIndex('donations', projectIdIndex);
      }

      const transactionHashIndex = table.indices.find(
        (idx) => idx.name === 'IDX_donations_transaction_hash',
      );
      if (transactionHashIndex) {
        await queryRunner.dropIndex('donations', transactionHashIndex);
      }
    }

    await queryRunner.dropTable('donations');
  }
}
