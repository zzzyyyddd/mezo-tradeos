// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TradeEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable musd;
    uint256 public nextTradeId;
    uint256 public constant DISPUTE_GRACE_PERIOD = 1 days;

    enum Status {
        Created,
        Funded,
        Disputed,
        Completed,
        Refunded
    }

    struct Trade {
        address buyer;
        address seller;
        address resolver;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 deadline;
        uint256 milestoneCount;
        uint256 nextMilestone;
        Status status;
    }

    mapping(uint256 => mapping(uint256 => bytes32))
        public milestoneEvidence;

    mapping(uint256 => Trade) public trades;
    mapping(uint256 => mapping(uint256 => uint256))
        public milestoneAmounts;

    event TradeCreated(
        uint256 indexed tradeId,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );

    event MilestoneSubmitted(
        uint256 indexed tradeId,
        uint256 indexed milestone,
        bytes32 evidenceHash
    );

    event TradeFunded(uint256 indexed tradeId);
    event MilestoneReleased(
        uint256 indexed tradeId,
        uint256 milestone,
        uint256 amount
    );
    event TradeDisputed(uint256 indexed tradeId);
    event TradeResolved(
        uint256 indexed tradeId,
        uint256 sellerAmount,
        uint256 buyerAmount
    );
    event TradeRefunded(uint256 indexed tradeId);

    constructor(address musdAddress) {
        require(musdAddress != address(0), "Invalid MUSD");
        musd = IERC20(musdAddress);
    }

    function createTrade(
        address seller,
        address resolver,
        uint256[] calldata amounts,
        uint256 deadline
    ) external returns (uint256 tradeId) {
        require(seller != address(0), "Invalid seller");
        require(seller != msg.sender, "Same party");
        require(resolver != address(0), "Invalid resolver");
        require(resolver != seller, "Resolver is seller");
        require(resolver != msg.sender, "Resolver is buyer");
        require(deadline > block.timestamp, "Invalid deadline");
        require(amounts.length > 0, "No milestones");
        require(amounts.length <= 50, "Too many milestones");

        uint256 total;

        tradeId = nextTradeId++;

        for (uint256 i; i < amounts.length; i++) {
            require(amounts[i] > 0, "Zero milestone");
            total += amounts[i];
            milestoneAmounts[tradeId][i] = amounts[i];
        }

        trades[tradeId] = Trade({
            buyer: msg.sender,
            seller: seller,
            resolver: resolver,
            totalAmount: total,
            releasedAmount: 0,
            deadline: deadline,
            milestoneCount: amounts.length,
            nextMilestone: 0,
            status: Status.Created
        });

        emit TradeCreated(
            tradeId,
            msg.sender,
            seller,
            total
        );
    }

    function fundTrade(uint256 tradeId)
        external
        nonReentrant
    {
        Trade storage t = trades[tradeId];

        require(t.buyer == msg.sender, "Not buyer");
        require(t.status == Status.Created, "Invalid status");
        require(block.timestamp < t.deadline, "Trade expired");

        t.status = Status.Funded;

        musd.safeTransferFrom(
            msg.sender,
            address(this),
            t.totalAmount
        );

        emit TradeFunded(tradeId);
    }

    function submitMilestone(
        uint256 tradeId,
        bytes32 evidenceHash
    ) external {
        Trade storage t = trades[tradeId];

        require(msg.sender == t.seller, "Not seller");
        require(t.status == Status.Funded, "Not funded");
        require(block.timestamp <= t.deadline, "Deadline passed");
        require(evidenceHash != bytes32(0), "Empty evidence");

        uint256 index = t.nextMilestone;

        require(index < t.milestoneCount, "All completed");

        require(
            milestoneEvidence[tradeId][index] == bytes32(0),
            "Evidence already submitted"
        );

        milestoneEvidence[tradeId][index] = evidenceHash;

        emit MilestoneSubmitted(
            tradeId,
            index,
            evidenceHash
        );
    }

    function releaseMilestone(uint256 tradeId)
        external
        nonReentrant
    {
        Trade storage t = trades[tradeId];

        require(t.buyer == msg.sender, "Not buyer");
        require(t.status == Status.Funded, "Not funded");
        require(
            t.nextMilestone < t.milestoneCount,
            "All released"
        );

        uint256 index = t.nextMilestone;

        require(
            milestoneEvidence[tradeId][index] != bytes32(0),
            "Evidence required"
        );

        uint256 amount = milestoneAmounts[tradeId][index];

        t.nextMilestone++;
        t.releasedAmount += amount;

        if (t.nextMilestone == t.milestoneCount) {
            t.status = Status.Completed;
        }

        musd.safeTransfer(t.seller, amount);

        emit MilestoneReleased(tradeId, index, amount);
    }

    function disputeTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];

        require(
            msg.sender == t.buyer ||
            msg.sender == t.seller,
            "Unauthorized"
        );

        require(t.status == Status.Funded, "Not funded");

        t.status = Status.Disputed;

        emit TradeDisputed(tradeId);
    }

    function resolveDispute(
        uint256 tradeId,
        uint256 sellerAmount
    ) external nonReentrant {
        Trade storage t = trades[tradeId];

        require(msg.sender == t.resolver, "Not resolver");
        require(t.status == Status.Disputed, "Not disputed");

        uint256 remaining =
            t.totalAmount - t.releasedAmount;

        require(
            sellerAmount <= remaining,
            "Exceeds remaining"
        );

        uint256 buyerAmount = remaining - sellerAmount;

        t.status = Status.Completed;

        if (sellerAmount > 0) {
            musd.safeTransfer(t.seller, sellerAmount);
        }

        if (buyerAmount > 0) {
            musd.safeTransfer(t.buyer, buyerAmount);
        }

        emit TradeResolved(
            tradeId,
            sellerAmount,
            buyerAmount
        );
    }

    function refundExpired(uint256 tradeId)
        external
        nonReentrant
    {
        Trade storage t = trades[tradeId];

        require(t.status == Status.Funded, "Not funded");
        require(
            block.timestamp > t.deadline + DISPUTE_GRACE_PERIOD,
            "Grace period active"
        );

        require(
            milestoneEvidence[tradeId][t.nextMilestone] == bytes32(0),
            "Pending submitted milestone"
        );

        uint256 remaining =
            t.totalAmount - t.releasedAmount;

        t.status = Status.Refunded;

        musd.safeTransfer(t.buyer, remaining);

        emit TradeRefunded(tradeId);
    }
}
