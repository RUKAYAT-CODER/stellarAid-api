import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAssetTypeToWithdrawals1743158400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'withdrawals',
      new TableColumn({
        name: 'assetType',
        type: 'varchar',
        default: "'XLM'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('withdrawals', 'assetType');
  }
}
