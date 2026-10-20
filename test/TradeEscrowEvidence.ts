import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem } = await network.connect();

describe("TradeOS Evidence Security", () => {
  it("14. Buyer cannot release milestone without evidence", async () => {
    const [buyer, seller, resolver] =
      await viem.getWalletClients();

    const musd = await viem.deployContract("MockMUSD");

    const escrow = await viem.deployContract(
      "TradeEscrow",
      [musd.address]
    );

    const publicClient = await viem.getPublicClient();
    const block = await publicClient.getBlock();

    await escrow.write.createTrade([
      seller.account.address,
      resolver.account.address,
      [parseEther("100")],
      block.timestamp + 86400n
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

    await assert.rejects(
      escrow.write.releaseMilestone([0n]),
      /Evidence required/
    );

    assert.equal(
      await musd.read.balanceOf([escrow.address]),
      parseEther("100")
    );

    assert.equal(
      await musd.read.balanceOf([seller.account.address]),
      0n
    );
  });
});
