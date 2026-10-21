"use client";

import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { mezoTestnet } from "@/lib/mezo";
import { keccak256, stringToHex } from "viem";
import { TRADE_ESCROW_ADDRESS } from "@/lib/mezo";
import escrowAbi from "@/lib/tradeEscrowAbi.json";
import { serializeEvidence } from "@/lib/evidenceContent";

type Props = {
  tradeId: string;
};

export default function EvidenceVerification({ tradeId }: Props) {
  const [cid, setCid] = useState("");
  const [milestone, setMilestone] = useState("0");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const verificationVersion = useRef(0);

  useEffect(() => {
    verificationVersion.current += 1;
    setResult("");
  }, [tradeId, milestone, cid]);


  const validTrade = /^\d+$/.test(tradeId);
  const validMilestone = /^\d+$/.test(milestone);

  const { refetch: refetchNextTradeId } = useReadContract({
    chainId: mezoTestnet.id,
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "nextTradeId",
    query: { enabled: false },
  });

  const { refetch } = useReadContract({
    chainId: mezoTestnet.id,
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "milestoneEvidence",
    args: [
      BigInt(validTrade ? tradeId : "0"),
      BigInt(validMilestone ? milestone : "0"),
    ],
    query: { enabled: false },
  });

  async function verify() {
    setResult("");
    setLoading(true);
    const version = ++verificationVersion.current;

    const showResult = (value: string) => {
      if (version === verificationVersion.current) {
        setResult(value);
      }
    };

    try {
      if (!validTrade || !validMilestone) {
        throw new Error("Invalid trade ID or milestone");
      }

      const nextIdResult = await refetchNextTradeId();

      if (nextIdResult.error || nextIdResult.data === undefined) {
        throw new Error("Unable to check Mezo trade counter");
      }

      if (BigInt(tradeId) >= BigInt(String(nextIdResult.data))) {
        throw new Error("TRADE NOT FOUND — This trade does not exist on Mezo");
      }

      const cleanCid = cid.trim();

      if (!/^[a-zA-Z0-9]{40,100}$/.test(cleanCid)) {
        throw new Error("Invalid IPFS CID");
      }

      const response = await fetch(
        `https://gateway.pinata.cloud/ipfs/${cleanCid}`
      );

      if (!response.ok) {
        throw new Error("Unable to retrieve IPFS evidence");
      }

      const raw = await response.text();

      if (raw.length > 4096) {
        throw new Error("Evidence document too large");
      }

      const document = JSON.parse(raw);

      if (
        document.tradeId !== tradeId ||
        document.milestone !== milestone
      ) {
        throw new Error("Evidence belongs to another trade or milestone");
      }

      const canonical = serializeEvidence(document);

      if (canonical !== raw) {
        throw new Error("Evidence document format mismatch");
      }

      const calculatedHash = keccak256(stringToHex(raw));

      const onchain = await refetch();

      if (onchain.error || !onchain.data) {
        throw new Error("Unable to read Mezo evidence hash");
      }

      const onchainHash = String(onchain.data);

      if (onchainHash === `0x${"00".repeat(32)}`) {
        showResult("NOT SUBMITTED — No evidence recorded on Mezo");
      } else if (
        calculatedHash.toLowerCase() === onchainHash.toLowerCase()
      ) {
        showResult("VERIFIED — IPFS evidence matches Mezo blockchain");
      } else {
        showResult("MISMATCH — Evidence hash does not match Mezo");
      }
    } catch (error) {
      showResult(
        error instanceof Error ? error.message : "Verification failed"
      );
    } finally {
      if (version === verificationVersion.current) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
      <h3 className="text-lg font-semibold text-cyan-200">
        IPFS Evidence Verification
      </h3>

      <p className="mt-2 text-sm text-slate-400">
        Retrieve evidence from IPFS and verify its hash against Mezo.
      </p>

      <label className="mt-4 block text-sm text-slate-300">
        Milestone index
        <input
          value={milestone}
          onChange={(e) => setMilestone(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d19] p-3"
        />
      </label>

      <label className="mt-4 block text-sm text-slate-300">
        Evidence CID
        <input
          value={cid}
          onChange={(e) => setCid(e.target.value)}
          placeholder="bafkrei..."
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d19] p-3"
        />
      </label>

      <button
        onClick={verify}
        disabled={loading || !validTrade || !validMilestone || !cid.trim()}
        className="mt-4 w-full rounded-xl bg-cyan-400 p-3 font-semibold text-slate-950 disabled:opacity-40"
      >
        {loading ? "Verifying..." : "Verify Evidence"}
      </button>

      {result && (
        <p
          role="status"
          className="mt-4 break-words rounded-xl border border-white/10 p-3 text-sm text-slate-200"
        >
          {result}
        </p>
      )}
    </div>
  );
}
