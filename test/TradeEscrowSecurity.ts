import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await network.connect();

async function fixture() {
  const [buyer, seller, resolver, attacker] =
    await viem.getWalletClients();

  const musd = await viem.deployContract("MockMUSD");
  const escrow = await viem.deployContract(
    "TradeEscrow",
    [musd.address]
  );

  await musd.write.mint([
    buyer.account.address,
    parseEther("1000")
  ]);

  const client = await viem.getPublicClient();
  const block = await client.getBlock();

  const deadline = block.timestamp + 86400n;

  await escrow.write.createTrade([
    seller.account.address,
    resolver.account.address,
    [parseEther("100"), parseEther("200")],
    deadline
  ]);

  await musd.write.approve([
    escrow.address,
    parseEther("300")
  ]);

  await escrow.write.fundTrade([0n]);

  return {
    buyer,
    seller,
    resolver,
    attacker,
    musd,
    escrow,
    deadline
  };
}

describe("TradeOS Security", () => {

  it("7. Rejects early refund", async () => {
    const { escrow } =
      await networkHelpers.loadFixture(fixture);

    await assert.rejects(
      escrow.write.refundExpired([0n])
    );
  });

  it("8. Rejects refund during grace period", async () => {
    const { escrow, deadline } =
      await networkHelpers.loadFixture(fixture);

    await networkHelpers.time.increaseTo(
      deadline + 3600n
    );

    await assert.rejects(
      escrow.write.refundExpired([0n])
    );
  });

  it("9. Seller can dispute during grace period", async () => {
    const { escrow, seller, deadline } =
      await networkHelpers.loadFixture(fixture);

    await networkHelpers.time.increaseTo(
      deadline + 3600n
    );

    await escrow.write.disputeTrade(
      [0n],
      { account: seller.account }
    );

    const trade = await escrow.read.trades([0n]);

    assert.equal(trade[8], 2);
  });

  it("10. Refund works after grace period", async () => {
    const { escrow, musd, buyer, deadline } =
      await networkHelpers.loadFixture(fixture);

    await networkHelpers.time.increaseTo(
      deadline + 86401n
    );

    await escrow.write.refundExpired([0n]);

    const balance = await musd.read.balanceOf([
      buyer.account.address
    ]);

    assert.equal(balance, parseEther("1000"));
  });

  it("11. Partial payment refund preserves released funds", async () => {
    const {
      escrow,
      musd,
      buyer,
      seller,
      deadline
    } = await networkHelpers.loadFixture(fixture);

    await escrow.write.submitMilestone(
      [0n, `0x${"11".repeat(32)}`],
      { account: seller.account }
    );
    await escrow.write.releaseMilestone([0n]);

    await networkHelpers.time.increaseTo(
      deadline + 86401n
    );

    await escrow.write.refundExpired([0n]);

    const buyerBalance = await musd.read.balanceOf([
      buyer.account.address
    ]);

    const sellerBalance = await musd.read.balanceOf([
      seller.account.address
    ]);

    assert.equal(buyerBalance, parseEther("900"));
    assert.equal(sellerBalance, parseEther("100"));
  });

  it("12. Attacker cannot resolve dispute", async () => {
    const { escrow, attacker } =
      await networkHelpers.loadFixture(fixture);

    await escrow.write.disputeTrade([0n]);

    await assert.rejects(
      escrow.write.resolveDispute(
        [0n, parseEther("100")],
        { account: attacker.account }
      )
    );
  });

  it("13. Expired trade cannot be funded", async () => {
    const [buyer, seller, resolver] =
      await viem.getWalletClients();

    const musd = await viem.deployContract("MockMUSD");
    const escrow = await viem.deployContract(
      "TradeEscrow",
      [musd.address]
    );

    const client = await viem.getPublicClient();
    const block = await client.getBlock();

    const deadline = block.timestamp + 100n;

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

    await networkHelpers.time.increaseTo(
      deadline + 1n
    );

    await assert.rejects(
      escrow.write.fundTrade([0n])
    );
  });

});
