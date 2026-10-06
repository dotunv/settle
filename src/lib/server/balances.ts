import { erc20Abi, formatUnits } from "viem";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/connection";
import { ApiError } from "./auth";
import { getMonadPublicClient } from "./rpc";

export async function syncGroupBalances(db: ReturnType<typeof getDb>, groupId: string) {
  const members = await db.query.groupMembers.findMany({ where: eq(schema.groupMembers.groupId, groupId) });
  if (process.env.ENABLE_DEMO_MODE === "true") return members;

  const tokenAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS as `0x${string}` | undefined;
  if (!tokenAddress || /^0x0{40}$/i.test(tokenAddress)) throw new ApiError(503, "USDC balance service is not configured");
  const client = getMonadPublicClient();
  let balances: bigint[];
  try {
    balances = await Promise.all(members.map((member) => client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [member.walletAddress as `0x${string}`],
    })));
  } catch (error) {
    // Group data remains useful when an RPC provider is temporarily unavailable.
    // Keep serving the last successfully persisted balances instead of failing the
    // whole group request.
    console.warn(JSON.stringify({
      level: "warn",
      event: "balance_sync_failed",
      groupId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    return members;
  }

  let total = 0;
  for (let index = 0; index < members.length; index++) {
    const balance = formatUnits(balances[index], 6);
    members[index].balanceUsdc = balance;
    total += Number(balance);
    await db.update(schema.groupMembers).set({ balanceUsdc: balance }).where(eq(schema.groupMembers.id, members[index].id));
  }
  await db.update(schema.groups).set({ totalBalanceUsdc: total.toFixed(6) }).where(eq(schema.groups.id, groupId));
  return members;
}
