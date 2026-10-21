"use client";

import {
  evidenceAuthMessage,
  type EvidenceAuthPayload,
} from "@/lib/evidenceAuth";
import {
  serializeEvidence,
  hashEvidence,
  type EvidenceDocument,
} from "@/lib/evidenceContent";


import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useSignMessage,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  isAddress,
  parseUnits,
  formatUnits,
  keccak256,
  stringToHex,
  decodeEventLog,
} from "viem";
import {
  Wallet,
  ShieldCheck,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  LockKeyhole,
  FileCheck2,
  ExternalLink,
} from "lucide-react";
import {
  mezoTestnet,
  TRADE_ESCROW_ADDRESS,
  MUSD_ADDRESS,
  musdAbi,
} from "@/lib/mezo";
import escrowAbi from "@/lib/tradeEscrowAbi.json";
import EvidenceVerification from "@/components/EvidenceVerification";
import { verifyIpfsEvidence } from "@/lib/verifyIpfsEvidence";

const explorer = "https://explorer.test.mezo.org";

function shortAddress(value?: string) {
  if (!value) return "—";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function parseMilestones(value: string) {
  const parts = value.split(",").map((x) => x.trim());

  if (!parts.length || parts.some((x) => !/^\d+(\.\d{1,18})?$/.test(x))) {
    throw new Error("Masukkan nominal milestone, contoh: 0.4, 0.6");
  }

  const amounts = parts.map((x) => parseUnits(x, 18));

  if (amounts.some((x) => x <= BigInt(0))) {
    throw new Error("Nominal milestone harus lebih dari nol");
  }

  return amounts;
}

export default function Home() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const { writeContractAsync, isPending: writing } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const [seller, setSeller] = useState("");
  const [resolver, setResolver] = useState("");
  const [amounts, setAmounts] = useState("0.4, 0.6");
  const [deadlineDays, setDeadlineDays] = useState("7");
  const [tradeId, setTradeId] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [createdTradeId, setCreatedTradeId] = useState<string | null>(null);

  const [evidenceCid, setEvidenceCid] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const [sellerAward, setSellerAward] = useState("0");
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    };

    updateTime();

    const interval = setInterval(updateTime, 30000);

  

  return () => clearInterval(interval);
  }, []);
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const correctChain = chainId === mezoTestnet.id;

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: MUSD_ADDRESS,
    abi: musdAbi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: Boolean(address) && correctChain },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: MUSD_ADDRESS,
    abi: musdAbi,
    functionName: "allowance",
    args: [address!, TRADE_ESCROW_ADDRESS],
    query: { enabled: Boolean(address) && correctChain },
  });

  const { data: nextTradeId, refetch: refetchNextId } = useReadContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "nextTradeId",
    query: { enabled: correctChain },
  });

  const parsedTradeId = /^\d+$/.test(tradeId) ? BigInt(tradeId) : BigInt(0);

  const { data: trade, refetch: refetchTrade } = useReadContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "trades",
    args: [parsedTradeId],
    query: {
      enabled:
        correctChain &&
        /^\d+$/.test(tradeId) &&
        nextTradeId !== undefined &&
        parsedTradeId < (nextTradeId as bigint),
    },
  });

  const tradeFields = trade as readonly unknown[] | undefined;
  const currentMilestone = tradeFields
    ? BigInt(String(tradeFields[7]))
    : BigInt(0);

  const milestoneCount = tradeFields
    ? BigInt(String(tradeFields[6]))
    : BigInt(0);

  const activeMilestone =
    Boolean(tradeFields) &&
    Number(tradeFields?.[8]) === 1 &&
    currentMilestone < milestoneCount;

  const { data: currentEvidence, refetch: refetchEvidence } =
    useReadContract({
      address: TRADE_ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "milestoneEvidence",
      args: [parsedTradeId, currentMilestone],
      query: { enabled: correctChain && activeMilestone },
    });

  const { data: currentAmount } = useReadContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "milestoneAmounts",
    args: [parsedTradeId, currentMilestone],
    query: { enabled: correctChain && activeMilestone },
  });

  const { data: gracePeriod } = useReadContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "DISPUTE_GRACE_PERIOD",
    query: { enabled: correctChain },
  });

  const {
    data: transactionReceipt,
    isLoading: confirming,
    isSuccess: confirmed,
  } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (
      pendingAction !== "Create Trade" ||
      !transactionReceipt ||
      transactionReceipt.status !== "success"
    ) {
      return;
    }

    for (const log of transactionReceipt.logs) {
      if (
        log.address.toLowerCase() !==
        TRADE_ESCROW_ADDRESS.toLowerCase()
      ) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: escrowAbi,
          data: log.data,
          topics: log.topics,
          eventName: "TradeCreated",
        });

        if (
          decoded.eventName !== "TradeCreated" ||
          !decoded.args ||
          Array.isArray(decoded.args) ||
          !("tradeId" in decoded.args)
        ) {
          continue;
        }

        const id = String(
          (decoded.args as { tradeId: bigint }).tradeId
        );

        setCreatedTradeId(id);
        setTradeId(id);
        setMessage(`Trade #${id} created successfully. Share this ID with your seller.`);
        setPendingAction("");
        break;
      } catch {
        // Ignore unrelated contract events.
      }
    }
  }, [transactionReceipt, pendingAction]);

  useEffect(() => {
    if (!confirmed) return;
    void refetchBalance();
    void refetchAllowance();
    void refetchNextId();
    void refetchTrade();
    void refetchEvidence();
  }, [
    confirmed,
    refetchBalance,
    refetchAllowance,
    refetchNextId,
    refetchTrade,
    refetchEvidence,
  ]);

  async function submit(
    label: string,
    action: () => Promise<`0x${string}`>
  ) {
    try {
      setMessage(`${label}: menunggu konfirmasi wallet...`);
      setTxHash(undefined);

      if (!correctChain) {
        throw new Error("Pindah ke Mezo Testnet terlebih dahulu");
      }

      const hash = await action();
      setPendingAction(label);
      setTxHash(hash);
      setMessage(`${label}: transaksi dikirim`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message.slice(0, 250)
          : "Transaksi gagal"
      );
    }
  }

  function createTrade() {
    setCreatedTradeId(null);
    void submit("Create Trade", async () => {
      if (!isAddress(seller) || !isAddress(resolver)) {
        throw new Error("Alamat seller atau resolver tidak valid");
      }

      const days = Number(deadlineDays);

      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("Deadline harus 1–365 hari");
      }

      const milestones = parseMilestones(amounts);
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + days * 86400
      );

      return writeContractAsync({
        address: TRADE_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "createTrade",
        args: [seller, resolver, milestones, deadline],
      });
    });
  }

  function approve() {
    void submit("Approve MUSD", async () => {
      if (!tradeData || !isBuyer || tradeStatus !== 0) {
        throw new Error("Hanya buyer dari trade Created yang dapat approve");
      }

      const total = BigInt(String(tradeData[3]));
      const released = BigInt(String(tradeData[4]));
      const remaining = total - released;

      if (remaining <= BigInt(0)) {
        throw new Error("Tidak ada MUSD yang perlu disetujui");
      }

      return writeContractAsync({
        address: MUSD_ADDRESS,
        abi: musdAbi,
        functionName: "approve",
        args: [TRADE_ESCROW_ADDRESS, remaining],
      });
    });
  }

  function contractAction(
    label: string,
    functionName: string,
    args: unknown[]
  ) {
    void submit(label, () =>
      writeContractAsync({
        address: TRADE_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName,
        args,
      })
    );
  }

  const tradeData = trade as readonly unknown[] | undefined;
  const tradeStatus = tradeData ? Number(tradeData[8]) : -1;
  const statusNames = [
    "Created",
    "Funded",
    "Disputed",
    "Completed",
    "Refunded",
  ];

  const isBuyer =
    Boolean(address && tradeData) &&
    String(tradeData?.[0]).toLowerCase() === address?.toLowerCase();

  const isSeller =
    Boolean(address && tradeData) &&
    String(tradeData?.[1]).toLowerCase() === address?.toLowerCase();

  const isResolver =
    Boolean(address && tradeData) &&
    String(tradeData?.[2]).toLowerCase() === address?.toLowerCase();

  const zeroHash = `0x${"00".repeat(32)}`;
  const hasEvidence =
    typeof currentEvidence === "string" &&
    currentEvidence !== zeroHash;

  const evidenceLoaded = currentEvidence !== undefined;

  const canFund = correctChain && isBuyer && tradeStatus === 0;
  const canSubmit =
    correctChain && isSeller && tradeStatus === 1 &&
    activeMilestone && evidenceLoaded && !hasEvidence;
  const canRelease =
    correctChain && isBuyer && tradeStatus === 1 &&
    activeMilestone && hasEvidence;
  const canDispute =
    correctChain &&
    (isBuyer || isSeller) &&
    tradeStatus === 1;
  const deadline = tradeData
    ? BigInt(String(tradeData[5]))
    : BigInt(0);

  const refundTimeReached =
    currentTime !== null &&
    gracePeriod !== undefined &&
    currentTime >
      Number(deadline + (gracePeriod as bigint));

  const canRefund =
    correctChain && tradeStatus === 1 &&
    activeMilestone && evidenceLoaded &&
    !hasEvidence && refundTimeReached;

  const canResolve =
    correctChain && isResolver && tradeStatus === 2;

  async function uploadEvidence() {
    if (!address || !canSubmit) {
      setMessage("Connect the Seller wallet for an active milestone.");
      return;
    }

    setUploadingEvidence(true);

    try {
      const document: EvidenceDocument = {
        app: "Mezo TradeOS",
        version: 1,
        tradeId,
        milestone: currentMilestone.toString(),
        description: evidenceDescription,
      };

      const canonical = serializeEvidence(document);
      const evidenceHash = hashEvidence(canonical);

      const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(nonceBytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      const authorization: EvidenceAuthPayload = {
        domain: window.location.host,
        chainId: mezoTestnet.id,
        contract: TRADE_ESCROW_ADDRESS,
        tradeId,
        milestone: currentMilestone.toString(),
        seller: address,
        evidenceHash,
        nonce,
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      };

      setMessage("Sign the evidence upload authorization in your wallet...");

      const signature = await signMessageAsync({
        message: evidenceAuthMessage(authorization),
      });

      setMessage("Uploading verified evidence to IPFS...");

      const response = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document,
          authorization,
          signature,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Evidence upload failed");
      }

      setEvidenceCid(result.cid);
      setMessage(
        `Evidence uploaded successfully. CID: ${result.cid}. Submit Evidence to record its hash on Mezo.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Evidence upload failed"
      );
    } finally {
      setUploadingEvidence(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080d19] text-slate-100">
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-cyan-400/30 bg-[#101b2e] p-4 text-sm text-slate-100 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="min-w-0 flex-1 break-words">{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <ShieldCheck size={24} />
              <span className="text-sm font-semibold tracking-[0.3em]">
                MEZO TRADEOS
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Trustless trade.
              <span className="text-cyan-400"> Real settlement.</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              MUSD milestone escrow on Mezo Testnet.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isConnected ? (
              <>
                <button
                  onClick={() => disconnect()}
                  className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200"
                >
                  <Wallet className="mr-2 inline" size={16} />
                  {shortAddress(address)} · Disconnect
                </button>
                {!correctChain && (
                  <button
                    onClick={() =>
                      switchChain({ chainId: mezoTestnet.id })
                    }
                    className="text-sm text-amber-400 underline"
                  >
                    Switch to Mezo Testnet
                  </button>
                )}
              </>
            ) : (
              <button
                disabled={connecting}
                onClick={() => {
                  const connector = connectors.find(
                    (c) => c.id === "injected"
                  ) ?? connectors[0];

                  if (connector) connect({ connector });
                }}
                className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300"
              >
                <Wallet className="mr-2 inline" size={17} />
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Your MUSD balance",
              value:
                balance !== undefined
                  ? Number(formatUnits(balance as bigint, 18)).toFixed(4)
                  : "—",
              detail: "Official Mezo MUSD",
              icon: Wallet,
            },
            {
              label: "Trades created",
              value: nextTradeId?.toString() ?? "—",
              detail: "On-chain trade counter",
              icon: LockKeyhole,
            },
            {
              label: "Network",
              value: correctChain ? "Mezo Testnet" : "Not connected",
              detail: "Chain ID 31611",
              icon: ShieldCheck,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-[#101a2b] p-5"
            >
              <item.icon className="mb-4 text-cyan-400" size={23} />
              <p className="text-sm text-slate-400">{item.label}</p>
              <p className="mt-2 text-2xl font-bold">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#101a2b] p-6">
            <div className="mb-6 flex items-center gap-3">
              <LockKeyhole className="text-cyan-400" />
              <div>
                <h2 className="text-xl font-semibold">Create Trade</h2>
                <p className="text-sm text-slate-400">
                  Set seller, resolver, and payment milestones.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block text-slate-300">
                  Seller address
                </span>
                <input
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-xl border border-white/10 bg-[#080d19] p-3 outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block text-slate-300">
                  Resolver address
                </span>
                <input
                  value={resolver}
                  onChange={(e) => setResolver(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-xl border border-white/10 bg-[#080d19] p-3 outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block text-slate-300">
                  Milestones in MUSD
                </span>
                <input
                  value={amounts}
                  onChange={(e) => setAmounts(e.target.value)}
                  placeholder="0.4, 0.6"
                  className="w-full rounded-xl border border-white/10 bg-[#080d19] p-3 outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-2 block text-slate-300">
                  Deadline (days)
                </span>
                <input
                  value={deadlineDays}
                  onChange={(e) => setDeadlineDays(e.target.value)}
                  type="number"
                  min="1"
                  max="365"
                  className="w-full rounded-xl border border-white/10 bg-[#080d19] p-3 outline-none focus:border-cyan-400"
                />
              </label>

              <button
                disabled={!isConnected || !correctChain || writing}
                onClick={createTrade}
                className="w-full rounded-xl bg-cyan-400 p-3 font-semibold text-slate-950 disabled:opacity-40"
              >
                Create On-Chain Trade
                <ArrowUpRight className="ml-2 inline" size={17} />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#101a2b] p-6">
            <div className="mb-6 flex items-center gap-3">
              <FileCheck2 className="text-cyan-400" />
              <div>
                <h2 className="text-xl font-semibold">Manage Trade</h2>
                <p className="text-sm text-slate-400">
                  Inspect and settle an existing escrow.
                </p>
              </div>
            </div>

            <label className="mb-5 block text-sm">
              <span className="mb-2 block text-slate-300">Trade ID</span>
              <input
                value={tradeId}
                onChange={(e) => setTradeId(e.target.value)}
                type="number"
                min="0"
                className="w-full rounded-xl border border-white/10 bg-[#080d19] p-3 outline-none focus:border-cyan-400"
              />
            </label>

        {(message || txHash) && (
          <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm">
            <div className="flex items-center gap-2">
              {confirming ? (
                <RefreshCw className="animate-spin text-cyan-400" size={16} />
              ) : confirmed ? (
                <CheckCircle2 className="text-emerald-400" size={16} />
              ) : (
                <ShieldCheck className="text-cyan-400" size={16} />
              )}
              <span>{message}</span>
            </div>
            {txHash && (
              <a
                href={`${explorer}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-cyan-300 underline"
              >
                View transaction on explorer
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}

            {createdTradeId && tradeId === createdTradeId && tradeStatus === 0 && tradeData && (
              <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <p className="text-sm font-semibold text-emerald-300">
                  Trade #{createdTradeId} Created Successfully
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Share this Trade ID with your seller.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdTradeId);
                      setMessage(`Trade ID ${createdTradeId} copied.`);
                    } catch {
                      setMessage(`Copy Trade ID manually: ${createdTradeId}`);
                    }
                  }}
                  className="mt-3 rounded-lg border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-200"
                >
                  Copy Trade ID: {createdTradeId}
                </button>
              </div>
            )}

            {tradeData ? (
              <div className="mb-5 space-y-3 rounded-xl border border-white/10 bg-[#080d19] p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className="font-semibold text-cyan-300">
                    {statusNames[tradeStatus] ?? `Status ${tradeStatus}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Buyer</span>
                  <span>{shortAddress(String(tradeData[0]))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Seller</span>
                  <span>{shortAddress(String(tradeData[1]))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total</span>
                  <span>
                    {formatUnits(tradeData[3] as bigint, 18)} MUSD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Released</span>
                  <span>
                    {formatUnits(tradeData[4] as bigint, 18)} MUSD
                  </span>
                </div>
                {activeMilestone && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current milestone</span>
                    <span>
                      {currentAmount !== undefined
                        ? formatUnits(currentAmount as bigint, 18)
                        : "Loading..."} MUSD
                      {" · "}
                      {hasEvidence ? "Evidence submitted" : "Awaiting evidence"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Next milestone</span>
                  <span>{String(tradeData[7])}</span>
                </div>
              </div>
            ) : (
              <div className="mb-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-400">
                Enter a Trade ID to view and manage an escrow.
              </div>
            )}

            {tradeData && (
              <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                disabled={!canFund || writing}
                onClick={approve}
                className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3 text-sm font-semibold text-cyan-200 disabled:opacity-40"
              >
                Approve MUSD
              </button>

              <button
                disabled={!canFund || writing}
                onClick={() =>
                  contractAction("Fund Trade", "fundTrade", [
                    parsedTradeId,
                  ])
                }
                className="rounded-xl bg-cyan-400 p-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                Fund Escrow
              </button>
            </div>

            <EvidenceVerification tradeId={tradeId} />

            <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
              <h3 className="text-sm font-semibold text-cyan-300">
                Upload Milestone Evidence
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Describe the completed work, sign with the Seller wallet,
                and upload directly to IPFS.
              </p>

              <textarea
                value={evidenceDescription}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                placeholder="Describe the delivered work and supporting evidence..."
                rows={4}
                maxLength={2000}
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#080d19] p-3 text-sm outline-none focus:border-cyan-400"
              />

              <button
                disabled={
                  !canSubmit ||
                  writing ||
                  uploadingEvidence ||
                  evidenceDescription.trim().length < 10
                }
                onClick={uploadEvidence}
                className="mt-3 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {uploadingEvidence ? "Uploading..." : "Sign & Upload to IPFS"}
              </button>
            </div>

            <label className="mt-5 block text-sm">
              <span className="mb-2 block text-slate-300">
                IPFS Evidence CID
              </span>
              <input
                value={evidenceCid}
                onChange={(e) => setEvidenceCid(e.target.value)}
                placeholder="Paste the CID of your uploaded evidence..."
                className="w-full rounded-xl border border-white/10 bg-[#080d19] p-3 outline-none focus:border-cyan-400"
              />
              <span className="mt-2 block text-xs text-slate-400">
                The evidence document must match this trade and milestone.
              </span>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                disabled={!canSubmit || writing || !evidenceCid.trim()}
                onClick={async () => {
                  try {
                    setMessage("Validating IPFS evidence...");
                    const hash = await verifyIpfsEvidence(
                      evidenceCid,
                      tradeId,
                      currentMilestone.toString()
                    );
                    await contractAction(
                      "Submit IPFS Evidence",
                      "submitMilestone",
                      [parsedTradeId, hash]
                    );
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Evidence validation failed"
                    );
                  }
                }}
                className="rounded-xl border border-white/20 p-3 text-sm font-semibold hover:border-cyan-400 disabled:opacity-40"
              >
                Submit Evidence
              </button>

              <button
                disabled={!canRelease || writing}
                onClick={() =>
                  contractAction(
                    "Release Milestone",
                    "releaseMilestone",
                    [parsedTradeId]
                  )
                }
                className="rounded-xl border border-white/20 p-3 text-sm font-semibold hover:border-cyan-400 disabled:opacity-40"
              >
                Release Milestone
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                disabled={!canDispute || writing}
                onClick={() =>
                  contractAction("Dispute Trade", "disputeTrade", [
                    parsedTradeId,
                  ])
                }
                className="rounded-xl border border-amber-500/30 p-3 text-sm text-amber-300 disabled:opacity-40"
              >
                Open Dispute
              </button>

              <button
                disabled={!canRefund || writing}
                onClick={() =>
                  contractAction(
                    "Refund Expired",
                    "refundExpired",
                    [parsedTradeId]
                  )
                }
                className="rounded-xl border border-white/20 p-3 text-sm text-slate-300 disabled:opacity-40"
              >
                Refund Expired
              </button>
            </div>
            {tradeStatus === 2 && canResolve && (
              <div className="mt-5 rounded-xl border border-amber-500/30 p-4">
                <h3 className="font-semibold text-amber-300">
                  Dispute Resolution
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Resolver chooses the MUSD amount awarded to seller
                  from the remaining escrow balance.
                </p>
                <input
                  value={sellerAward}
                  onChange={(e) => setSellerAward(e.target.value)}
                  placeholder="Seller award in MUSD"
                  className="mt-3 w-full rounded-xl border border-white/10 bg-[#080d19] p-3"
                />
                <button
                  disabled={!canResolve || writing}
                  onClick={() => {
                    try {
                      const award = parseUnits(sellerAward, 18);
                      const remaining =
                        BigInt(String(tradeData?.[3] ?? 0)) -
                        BigInt(String(tradeData?.[4] ?? 0));

                      if (award > remaining) {
                        throw new Error("Award exceeds remaining escrow");
                      }

                      contractAction(
                        "Resolve Dispute",
                        "resolveDispute",
                        [parsedTradeId, award]
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Invalid award"
                      );
                    }
                  }}
                  className="mt-3 w-full rounded-xl bg-amber-400 p-3 font-semibold text-slate-950 disabled:opacity-40"
                >
                  Resolve Dispute
                </button>
              </div>
            )}
              </div>
            )}
          </section>
        </div>



        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500">
          <span>Mezo TradeOS · Milestone settlement infrastructure</span>
          <a
            href={`${explorer}/address/${TRADE_ESCROW_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 hover:text-cyan-300"
          >
            Verified on-chain deployment
            <ExternalLink size={13} />
          </a>
        </footer>
      </div>
    </main>
  );
}
