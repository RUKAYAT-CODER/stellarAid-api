import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  Memo,
  Horizon,
} from '@stellar/stellar-sdk';

@Injectable()
export class StellarPayoutService {
  private readonly logger = new Logger(StellarPayoutService.name);
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: string;
  private readonly platformKeypair: Keypair;
  private readonly usdcIssuer: string;
  private readonly ngntIssuer: string;

  constructor(private readonly configService: ConfigService) {
    const horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    const network = this.configService.get<string>('STELLAR_NETWORK', 'TESTNET');
    const secretKey = this.configService.get<string>('STELLAR_PLATFORM_SECRET_KEY');

    if (!secretKey) {
      throw new Error(
        'STELLAR_PLATFORM_SECRET_KEY environment variable is required for the payout service',
      );
    }

    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = network === 'PUBLIC' ? Networks.PUBLIC : Networks.TESTNET;
    this.platformKeypair = Keypair.fromSecret(secretKey);
    this.usdcIssuer = this.configService.get<string>('STELLAR_USDC_ISSUER', '');
    this.ngntIssuer = this.configService.get<string>('STELLAR_NGNT_ISSUER', '');

    this.logger.log(
      `StellarPayoutService initialized. Platform public key: ${this.platformKeypair.publicKey()}`,
    );
  }

  getPlatformPublicKey(): string {
    return this.platformKeypair.publicKey();
  }

  private resolveAsset(assetType: string): Asset {
    switch (assetType.toUpperCase()) {
      case 'XLM':
        return Asset.native();
      case 'USDC':
        if (!this.usdcIssuer) {
          throw new BadRequestException('STELLAR_USDC_ISSUER is not configured');
        }
        return new Asset('USDC', this.usdcIssuer);
      case 'NGNT':
        if (!this.ngntIssuer) {
          throw new BadRequestException('STELLAR_NGNT_ISSUER is not configured');
        }
        return new Asset('NGNT', this.ngntIssuer);
      default:
        throw new BadRequestException(`Unsupported asset type: ${assetType}`);
    }
  }

  /**
   * Send a payment to a destination address on the Stellar network.
   * @returns The transaction hash of the submitted payment.
   */
  async sendPayment(params: {
    destinationAddress: string;
    amount: number;
    assetType: string;
    withdrawalId: string;
  }): Promise<{ transactionHash: string }> {
    const { destinationAddress, amount, assetType, withdrawalId } = params;

    const asset = this.resolveAsset(assetType);

    try {
      const sourceAccount = await this.server.loadAccount(
        this.platformKeypair.publicKey(),
      );
      const baseFee = await this.server.fetchBaseFee();

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: String(baseFee),
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: destinationAddress,
            asset,
            amount: amount.toFixed(7),
          }),
        )
        // Memo identifies the withdrawal — max 28 bytes for text memo
        .addMemo(Memo.text(withdrawalId.slice(0, 28)))
        .setTimeout(30)
        .build();

      transaction.sign(this.platformKeypair);

      this.logger.log(
        `Submitting ${assetType} payment of ${amount} to ${destinationAddress} for withdrawal ${withdrawalId}`,
      );

      const result = await this.server.submitTransaction(transaction);

      this.logger.log(
        `Payment submitted successfully. Hash: ${result.hash}`,
      );

      return { transactionHash: result.hash };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      // Extract Stellar-specific error codes for clearer diagnostics
      const stellarResultCodes = (error as any)?.response?.data?.extras
        ?.result_codes;
      if (stellarResultCodes) {
        const message = `Stellar transaction failed: ${JSON.stringify(stellarResultCodes)}`;
        this.logger.error(message);
        throw new InternalServerErrorException(message);
      }

      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to submit Stellar payment: ${message}`, error);
      throw new InternalServerErrorException(
        `Payment submission failed: ${message}`,
      );
    }
  }
}
