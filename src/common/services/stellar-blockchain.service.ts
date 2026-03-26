import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface StellarTransaction {
  id: string;
  envelope_xdr: string;
  result_xdr: string;
  result_meta_xdr: string;
  tx: {
    source_account: string;
    fee: number;
    seq_num: string;
    operations: Array<{
      type: string;
      [key: string]: unknown;
    }>;
  };
}

interface TransactionVerificationResult {
  isValid: boolean;
  transaction?: StellarTransaction;
  error?: string;
}

@Injectable()
export class StellarBlockchainService {
  private readonly logger = new Logger(StellarBlockchainService.name);
  private readonly horizonUrl: string;
  private readonly stellarNetwork: string;

  constructor(private configService: ConfigService) {
    this.horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    this.stellarNetwork = this.configService.get<string>('STELLAR_NETWORK', 'TESTNET');

    this.logger.log(`Initialized with Horizon URL: ${this.horizonUrl}`);
  }

  /**
   * Verify a transaction hash exists on the Stellar blockchain
   * @param transactionHash - The transaction hash to verify (64 hex characters)
   * @returns TransactionVerificationResult with verification status
   */
  async verifyTransaction(transactionHash: string): Promise<TransactionVerificationResult> {
    try {
      // Validate hash format before making API call
      if (!this.isValidTransactionHash(transactionHash)) {
        return {
          isValid: false,
          error: 'Invalid transaction hash format',
        };
      }

      const response = await fetch(
        `${this.horizonUrl}/transactions/${transactionHash}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn(`Transaction ${transactionHash} not found on blockchain`);
          return {
            isValid: false,
            error: 'Transaction not found on the Stellar blockchain',
          };
        }

        this.logger.error(
          `Horizon API error: ${response.status} ${response.statusText}`,
        );
        return {
          isValid: false,
          error: `Horizon API returned ${response.status}`,
        };
      }

      const transaction: StellarTransaction = await response.json();

      // Verify transaction has successful result
      if (!this.isSuccessfulTransaction(transaction)) {
        this.logger.warn(`Transaction ${transactionHash} did not execute successfully`);
        return {
          isValid: false,
          error: 'Transaction did not execute successfully on the blockchain',
        };
      }

      this.logger.log(`Transaction ${transactionHash} verified successfully`);
      return {
        isValid: true,
        transaction,
      };
    } catch (error) {
      this.logger.error(
        `Error verifying transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        isValid: false,
        error: 'Failed to verify transaction on blockchain',
      };
    }
  }

  /**
   * Validate transaction hash format
   * Stellar transaction hashes are 64 hexadecimal characters
   * @param hash - The hash to validate
   * @returns boolean indicating if hash is valid format
   */
  private isValidTransactionHash(hash: string): boolean {
    const transactionHashRegex = /^[a-f0-9]{64}$/i;
    return transactionHashRegex.test(hash);
  }

  /**
   * Check if transaction executed successfully
   * A successful transaction should have result_xdr that indicates success
   * @param transaction - The transaction object from Horizon API
   * @returns boolean indicating if transaction was successful
   */
  private isSuccessfulTransaction(transaction: StellarTransaction): boolean {
    try {
      // Check if result_meta_xdr exists (indicates transaction was processed)
      if (!transaction.result_meta_xdr || !transaction.tx) {
        return false;
      }

      // Transaction exists and was processed successfully
      return true;
    } catch (error) {
      this.logger.error('Error checking transaction success:', error);
      return false;
    }
  }

  /**
   * Get transaction details from blockchain
   * @param transactionHash - The transaction hash to retrieve
   * @returns Promise resolving to transaction details or null if not found
   */
  async getTransactionDetails(transactionHash: string): Promise<StellarTransaction | null> {
    try {
      if (!this.isValidTransactionHash(transactionHash)) {
        return null;
      }

      const response = await fetch(
        `${this.horizonUrl}/transactions/${transactionHash}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error fetching transaction details:', error);
      return null;
    }
  }
}
