import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("TradeOS Refund Guard", () => {
  it("18. Cannot refund submitted milestone without settlement", async () => {
    const [buyer, seller, resolver] =
      await viem.getWalletClients();

    const musd = await viem.deployContract("MockMUSD");
    const escrow = await viem.deployContract(
      "TradeEscrow",
      [musd.address]
    );

    const publicClient = await viem.getPublicClient();
    const block = await publicClient.getBlock();

    const deadline = block.timestamp + 86400n;

    await escrow.write.createTrade([
      seller.account.address,
      resolver.account.address,
      [parseEther("100")],
      deadline
    ]);

    await musd.write.mint([
      buyer.account.address,
      parseEther("100")
    ]);

    await musd.write.approve([
      escrow.address,
      parseEther("100")
    ]);

    await escrow.write.fundTrade([0n]);

    await escrow.write.submitMilestone(
      [0n, `0x${"11".repeat(32)}`],
      { account: seller.account }
    );

    await networkHelpers.time.increaseTo(
      deadline + 86401n
    );

    await assert.rejects(
      escrow.write.refundExpired([0n]),
      /Pending submitted milestone/
    );

    assert.equal(
      await musd.read.balanceOf([escrow.address]),
      parseEther("100")
    );
  });
});
