import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await network.connect();

const evidence1 = `0x${"11".repeat(32)}` as `0x${string}`;
const evidence2 = `0x${"22".repeat(32)}` as `0x${string}`;
const emptyEvidence = `0x${"00".repeat(32)}` as `0x${string}`;

async function fixture() {
  const [buyer, seller, resolver, attacker] =
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

  return { buyer, seller, resolver, attacker, musd, escrow };
}

describe("TradeOS Evidence Lock", () => {

  it("15. Attacker cannot submit evidence", async () => {
    const { escrow, attacker } =
      await networkHelpers.loadFixture(fixture);

    await assert.rejects(
      escrow.write.submitMilestone(
        [0n, evidence1],
        { account: attacker.account }
      ),
      /Not seller/
    );
  });

  it("16. Empty evidence is rejected", async () => {
    const { escrow, seller } =
      await networkHelpers.loadFixture(fixture);

    await assert.rejects(
      escrow.write.submitMilestone(
        [0n, emptyEvidence],
        { account: seller.account }
      ),
      /Empty evidence/
    );
  });

  it("17. Seller cannot replace submitted evidence", async () => {
    const { escrow, seller } =
      await networkHelpers.loadFixture(fixture);

    await escrow.write.submitMilestone(
      [0n, evidence1],
      { account: seller.account }
    );

    await assert.rejects(
      escrow.write.submitMilestone(
        [0n, evidence2],
        { account: seller.account }
      ),
      /Evidence already submitted/
    );

    const stored = await escrow.read.milestoneEvidence([
      0n,
      0n
    ]);

    assert.equal(stored.toLowerCase(), evidence1.toLowerCase());
  });

});
