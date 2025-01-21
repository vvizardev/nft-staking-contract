import { SolanaAgentKit } from "../../agent";
import {
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { VoltrClient } from "@voltr/vault-sdk";

/**
 * Withdraws assets from a Voltr strategy
 * @param agent SolanaAgentKit instance
 * @param withdrawAmount Amount to withdraw in base units (BN)
 * @param vault Public key of the target vault
 * @param strategy Public key of the target strategy
 * @returns Transaction signature for the deposit
 */
export async function voltrWithdrawStrategy(
  agent: SolanaAgentKit,
  withdrawAmount: BN,
  vault: PublicKey,
  strategy: PublicKey,
): Promise<string> {
  const vc = new VoltrClient(agent.connection, agent.wallet);
  const vaultAccount = await vc.fetchVaultAccount(vault);
  const vaultAssetMint = vaultAccount.asset.mint;
  const assetTokenProgram = await agent.connection
    .getAccountInfo(new PublicKey(vaultAssetMint))
    .then((account) => account?.owner);

  if (
    !assetTokenProgram ||
    !(
      assetTokenProgram.equals(TOKEN_PROGRAM_ID) ||
      assetTokenProgram.equals(TOKEN_2022_PROGRAM_ID)
    )
  ) {
    throw new Error("Invalid asset token program");
  }

  const response = await fetch(
    `https://voltr.xyz/api/remaining-accounts/deposit-strategy?vault=${vault.toBase58()}&strategy=${strategy.toBase58()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const data = (await response.json()).data as {
    instructionDiscriminator: number[] | null;
    additionalArgs: number[] | null;
    remainingAccounts:
      | {
          pubkey: string;
          isSigner: boolean;
          isWritable: boolean;
        }[]
      | null;
  };

  const additionalArgs = data.additionalArgs
    ? Buffer.from(data.additionalArgs)
    : null;
  const instructionDiscriminator = data.instructionDiscriminator
    ? Buffer.from(data.instructionDiscriminator)
    : null;
  const remainingAccounts =
    data.remainingAccounts?.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })) ?? [];

  const withdrawIx = await vc.createWithdrawStrategyIx(
    {
      withdrawAmount,
      additionalArgs,
      instructionDiscriminator,
    },
    {
      vault,
      vaultAssetMint,
      strategy,
      assetTokenProgram,
      remainingAccounts,
    },
  );

  const transaction = new Transaction();
  transaction.add(withdrawIx);

  const txSig = await sendAndConfirmTransaction(agent.connection, transaction, [
    agent.wallet,
  ]);
  return txSig;
}