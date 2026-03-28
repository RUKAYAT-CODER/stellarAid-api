# Donation Verification API Usage Guide

## Quick Start

### 1. Verify a Transaction (Public)
```bash
GET /donations/verification/verify/:transactionHash
```

**Example:**
```bash
curl http://localhost:3000/donations/verification/verify/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

**Response:**
```json
{
  "isValid": true,
  "transactionHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "amount": "100",
  "asset": "XLM",
  "projectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": []
}
```

---

### 2. Verify with Validation (Authenticated)
```bash
POST /donations/verification/verify
Authorization: Bearer <JWT_TOKEN>
```

**Request Body:**
```json
{
  "transactionHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "expectedAmount": 100,
  "expectedAsset": "XLM",
  "expectedProjectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response:**
Same as above, but validates against expected values.

---

### 3. Record Verified Donation (Admin Only)
```bash
POST /donations/verification/record
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Request Body:**
```json
{
  "transactionHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "projectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "donorId": "user-uuid-here", // Optional
  "isAnonymous": false
}
```

**Success Response:**
```json
{
  "success": true,
  "donationId": "donation-uuid-here",
  "message": "Donation recorded successfully",
  "duplicate": false
}
```

---

### 4. Check Duplicate Transaction (Public)
```bash
GET /donations/verification/check-duplicate/:transactionHash
```

**Response:**
```json
{
  "transactionHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "isDuplicate": true,
  "exists": true
}
```

---

### 5. Get Donation by Hash (Public)
```bash
GET /donations/verification/transaction/:transactionHash
```

**Response (Found):**
```json
{
  "success": true,
  "donation": {
    "id": "donation-uuid",
    "projectId": "project-uuid",
    "amount": 100,
    "assetType": "XLM",
    "transactionHash": "tx-hash",
    "isAnonymous": false,
    "verified": true,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "message": "Donation not found",
  "transactionHash": "tx-hash"
}
```

---

## Error Responses

### Invalid Transaction Hash
```json
{
  "isValid": false,
  "transactionHash": "invalid-hash",
  "amount": "0",
  "asset": "XLM",
  "projectId": null,
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": ["Invalid transaction hash format"]
}
```

### Transaction Not Found
```json
{
  "isValid": false,
  "transactionHash": "nonexistent-hash",
  "amount": "0",
  "asset": "XLM",
  "projectId": null,
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": ["Transaction not found on the Stellar blockchain"]
}
```

### Amount Mismatch
```json
{
  "isValid": false,
  "transactionHash": "tx-hash",
  "amount": "95",
  "asset": "XLM",
  "projectId": "project-uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": ["Amount mismatch: expected 100, got 95"]
}
```

### Destination Not Platform Wallet
```json
{
  "isValid": false,
  "transactionHash": "tx-hash",
  "amount": "100",
  "asset": "XLM",
  "projectId": "project-uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": ["Transaction destination is not a platform wallet"]
}
```

---

## Complete Flow Example

### Step 1: User Makes Donation on Blockchain
User sends 100 XLM to platform wallet with memo: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### Step 2: Frontend Verifies Transaction
```javascript
const response = await fetch(
  'http://localhost:3000/donations/verification/verify/' + transactionHash
);
const result = await response.json();

if (result.isValid && result.projectId === expectedProjectId) {
  // Transaction is valid, proceed to record
}
```

### Step 3: Record Donation (Admin/Automated)
```javascript
const response = await fetch(
  'http://localhost:3000/donations/verification/record',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transactionHash: result.transactionHash,
      projectId: result.projectId,
      donorId: currentUserId, // Optional
      isAnonymous: false
    })
  }
);

const recordResult = await response.json();
console.log(`Donation recorded: ${recordResult.donationId}`);
```

### Step 4: Check Project Updated
```javascript
const projectResponse = await fetch(
  'http://localhost:3000/projects/' + projectId
);
const project = await projectResponse.json();
console.log(`Funds raised: ${project.fundsRaised}`); // Should include donation
```

---

## Integration with Existing Services

### Using in DonationsService
The existing `DonationsService.create()` already uses verification:

```typescript
// In donations.service.ts
async create(createDonationDto: CreateDonationDto, donorId?: string) {
  
  // Verify transaction on Stellar blockchain
  const verificationResult =
    await this.stellarBlockchainService.verifyTransaction(transactionHash);
  
  if (!verificationResult.isValid) {
    throw new BadRequestException(
      `Transaction verification failed: ${verificationResult.error}`
    );
  }
  
  // Create donation record
  // ... rest of code ...
}
```

### Using DonationRecordingService Directly
For automated workflows (like Stellar sync polling):

```typescript
// In stellar-sync-processor.service.ts
async processPaymentOperation(operation, transaction, projectId) {
  // Verify transaction
  const verification = await this.stellarBlockchainService.verifyTransaction(
    transaction.id,
    amount,
    assetType,
    operation.to,
  );
  
  if (!verification.isValid) {
    this.logger.warn('Verification failed');
    return;
  }
  
  // Record verified donation
  const result = await this.donationRecordingService.recordVerifiedDonation({
    isValid: verification.isValid,
    transactionHash: transaction.id,
    amount: amount.toString(),
    asset: assetType,
    projectId,
    timestamp: new Date(transaction.created_at),
    errors: [],
    donorAddress: operation.from,
    destinationAddress: operation.to,
  });
  
  console.log(`Donation recorded: ${result.donationId}`);
}
```

---

## Configuration Required

Add to your `.env` file:

```env
# REQUIRED: Platform wallet addresses to accept donations
STELLAR_PLATFORM_ADDRESSES=GD123...YOUR-PUBLIC-KEY-HERE

# Optional: Customize polling interval for Stellar sync
STELLAR_POLLING_INTERVAL_SECONDS=30

# Optional: Max retries for failed API calls
STELLAR_POLLING_MAX_RETRIES=3
```

---

## Testing with Stellar Testnet

### 1. Get Testnet Lumens
Visit: https://laboratory.stellar.org/#account-creator?network=test

### 2. Make Test Transaction
Use Stellar Laboratory to send payment with memo:
- Network: Testnet
- Amount: 100 XLM
- Memo: Your project UUID
- Memo Type: TEXT

### 3. Get Transaction Hash
After submission, copy the transaction hash from the response.

### 4. Test Verification Endpoint
```bash
curl http://localhost:3000/donations/verification/verify/YOUR_TX_HASH
```

---

## Best Practices

1. **Always verify before recording** - Use the verification endpoint first
2. **Handle duplicates gracefully** - Check before attempting to record
3. **Log all verification attempts** - For audit trail
4. **Monitor error rates** - Detect potential fraud or system issues
5. **Cache verification results** - Already implemented (5-min TTL)
6. **Use admin endpoint for recording** - Prevents unauthorized recordings

---

## Troubleshooting

### "Transaction not found"
- Wait for Stellar network confirmation (~5 seconds)
- Check you're using correct network (testnet vs public)
- Verify transaction hash is complete (64 characters)

### "Destination mismatch"
- Ensure `STELLAR_PLATFORM_ADDRESSES` includes your wallet
- Check payment was sent to correct address

### "Amount mismatch"
- Verify claimed amount matches actual blockchain amount
- Consider floating-point precision (tolerance: 0.000001)

### "Project ID not extracted"
- Ensure memo is in correct format (UUID or "donation:UUID")
- Check memo type is TEXT (not ID or HASH)

---

## Support

For issues or questions:
1. Check logs for detailed error messages
2. Review Stellar Horizon API response
3. Verify environment configuration
4. Test with Stellar Laboratory first
