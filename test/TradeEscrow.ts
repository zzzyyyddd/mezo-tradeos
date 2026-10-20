import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } =
  await network.connect();

async function deployFixture() {
  const [buyer, seller, resolver, attacker] =
    await viem.getWalletClients();

  const musd = await viem.deployContract("MockMUSD");

  const escrow = await viem.deployContract(
    "TradeEscrow",
    [musd.address]
  );

  await musd.write.mint([
    buyer.account.address,
    parseEther("10000")
  ]);

  const latest = await viem.getPublicClient()
    .then(c => c.getBlock());

  const deadline =
    latest.timestamp + 86400n;

  const amounts = [
    parseEther("100"),
    parseEther("200"),
    parseEther("300")
  ];

  await escrow.write.createTrade([
    seller.account.address,
    resolver.account.address,
    amounts,
    deadline
  ]);

  return {
    buyer,
    seller,
    resolver,
    attacker,
    musd,
    escrow
  };
}

describe("Mezo TradeOS Escrow", function () {

  it("1. Buyer can fund escrow", async function () {
    const { buyer, musd, escrow } =
      await networkHelpers.loadFixture(deployFixture);

    await musd.write.approve([
      escrow.address,
      parseEther("600")
    ]);

    await escrow.write.fundTrade([0n]);

    const balance =
      await musd.read.balanceOf([escrow.address]);

    assert.equal(balance, parseEther("600"));
  });

  it("2. Buyer releases first milestone", async function () {
    const { musd, escrow, seller } =
      await networkHelpers.loadFixture(deployFixture);

    await musd.write.approve([
      escrow.address,
      parseEther("600")
    ]);

    await escrow.write.fundTrade([0n]);
    await escrow.write.submitMilestone(
      [0n, `0x${"11".repeat(32)}`],
      { account: seller.account }
    );
    await escrow.write.releaseMilestone([0n]);

    const balance =
      await musd.read.balanceOf([
        seller.account.address
      ]);

    assert.equal(balance, parseEther("100"));
  });

  it("3. Attacker cannot release milestone", async function () {
    const { musd, escrow, attacker } =
      await networkHelpers.loadFixture(deployFixture);

    await musd.write.approve([
      escrow.address,
      parseEther("600")
    ]);

    await escrow.write.fundTrade([0n]);

    await assert.rejects(
      escrow.write.releaseMilestone(
        [0n],
        { account: attacker.account }
      )
    );
  });

  it("4. Buyer can dispute", async function () {
    const { musd, escrow, seller } =
      await networkHelpers.loadFixture(deployFixture);

    await musd.write.approve([
      escrow.address,
      parseEther("600")
    ]);

    await escrow.write.fundTrade([0n]);
    await escrow.write.disputeTrade([0n]);

    const trade = await escrow.read.trades([0n]);

    assert.equal(trade[8], 2);
  });

  it("5. Resolver can settle dispute", async function () {
    const { musd, escrow, resolver, seller } =
      await networkHelpers.loadFixture(deployFixture);

    await musd.write.approve([
      escrow.address,
      parseEther("600")
    ]);

    await escrow.write.fundTrade([0n]);
    await escrow.write.disputeTrade([0n]);

    await escrow.write.resolveDispute(
      [0n, parseEther("250")],
      { account: resolver.account }
    );

    const balance =
      await musd.read.balanceOf([
        seller.account.address
      ]);

    assert.equal(balance, parseEther("250"));
  });

  it("6. Cannot release milestone twice after completion", async function () {
    const { musd, escrow, seller } =
      await networkHelpers.loadFixture(deployFixture);

    await musd.write.approve([
      escrow.address,
      parseEther("600")
    ]);

    await escrow.write.fundTrade([0n]);

    for (let i = 1; i <= 3; i++) {
      const evidence = `0x${i.toString(16).padStart(2, "0").repeat(32)}`;

      await escrow.write.submitMilestone(
        [0n, evidence],
        { account: seller.account }
      );

      await escrow.write.releaseMilestone([0n]);
    }

    await assert.rejects(
      escrow.write.releaseMilestone([0n])
    );

    const sellerBalance = await musd.read.balanceOf([
      seller.account.address
    ]);

    assert.equal(sellerBalance, parseEther("600"));
  });

});
