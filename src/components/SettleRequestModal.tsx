"use client";

import { useState, useEffect } from "react";

import { Group, MoneyRequest, Transaction } from "@/lib/types";
import { updateRequestStatus, updateMemberBalance, createTransaction } from "@/lib/db";
import { formatNgn, generateMockTxHash, getNgnRate } from "@/lib/currency";
import { Sheet, SheetHeader, StepPanel } from "./ui/Sheet";
import { Avatar, memberName } from "./ui/Avatar";
import { ProcessingView, SuccessView, ErrorView } from "./ui/Status";

interface SettleRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: MoneyRequest;
  group: Group;
  currentUserWallet: string;
  onSuccess: () => void;
}

type SettleStep = "confirm" | "sending" | "success" | "error";

export function SettleRequestModal({
  isOpen,
  onClose,
  request,
  group,
  currentUserWallet,
  onSuccess,
}: SettleRequestModalProps) {
  const rate = getNgnRate();
  const [step, setStep] = useState<SettleStep>("confirm");
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState("");

  const requester = group.members.find(
    (m) => m.walletAddress.toLowerCase() === request.fromAddress.toLowerCase()
  );
  const requesterName = requester ? memberName(requester) : "them";

  const currentMember = group.members.find(
    (m) => m.walletAddress.toLowerCase() === currentUserWallet.toLowerCase()
  );
  const myName = memberName(currentMember);
  const currentBalanceUsdc = parseFloat(currentMember?.balance.usdc || "0");
  const currentBalanceNgn = currentBalanceUsdc * rate;

  const requestAmountUsdc = parseFloat(request.amountUsdc);
  const requestAmountNgn = parseFloat(request.amountNgn);
  const hasEnoughBalance = currentBalanceUsdc >= requestAmountUsdc;

  const handlePay = async () => {
    if (!hasEnoughBalance) {
      setError("Not enough balance to pay this request");
      setStep("error");
      return;
    }

    setStep("sending");
    setError("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const txHash = generateMockTxHash();

      const newTx = await createTransaction({
        groupId: group.id,
        type: "settle",
        fromAddress: currentUserWallet,
        toAddress: request.fromAddress,
        amountUsdc: request.amountUsdc,
        amountNgn: request.amountNgn,
        txHash,
        status: "confirmed",
        note: request.note,
      });

      const newPayerBalance = (currentBalanceUsdc - requestAmountUsdc).toFixed(6);
      await updateMemberBalance(group.id, currentUserWallet, newPayerBalance);

      if (requester) {
        const requesterBalance = parseFloat(requester.balance.usdc || "0");
        const newRequesterBalance = (requesterBalance + requestAmountUsdc).toFixed(6);
        await updateMemberBalance(group.id, requester.walletAddress, newRequesterBalance);
      }

      await updateRequestStatus(request.id, "paid", newTx.id);

      setTransaction(newTx);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  };

  const handleDecline = async () => {
    await updateRequestStatus(request.id, "declined");
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    if (step === "success") onSuccess();
    setStep("confirm");
    setTransaction(null);
    setError("");
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setStep("confirm");
      setTransaction(null);
      setError("");
    }
  }, [isOpen]);

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} label="Settle up" locked={step === "sending"}>
      {step === "confirm" && (
        <StepPanel stepKey="confirm">
          <SheetHeader title="Settle up" onClose={handleClose} />
          <div className="px-5 pb-5 pt-3">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-coral-400 via-coral-500 to-fuchsia-600 p-6 text-center text-white shadow-glow-coral">
              <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-sun-300/40 blur-2xl" />
              <div className="relative mx-auto w-fit">
                <Avatar name={requesterName} seed={requester?.walletAddress} size="lg" ring />
              </div>
              <p className="relative mt-4 text-sm font-medium text-white/85">{requesterName} asked you for</p>
              <p className="tabular relative mt-1 font-display text-5xl font-extrabold tracking-tight">
                {formatNgn(requestAmountNgn)}
              </p>
              {request.note && (
                <p className="relative mx-auto mt-3 w-fit rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
                  {request.note}
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl bg-cream px-4 py-3 text-sm">
              <span className="text-ink-muted">Your balance</span>
              <span className={`tabular font-bold ${hasEnoughBalance ? "text-ink" : "text-coral-700"}`}>
                {formatNgn(currentBalanceNgn)}
              </span>
            </div>

            {!hasEnoughBalance && (
              <p className="mt-3 text-center text-sm font-medium text-coral-700" role="alert">
                You need {formatNgn(requestAmountNgn - currentBalanceNgn)} more to pay this.
              </p>
            )}

            <div className="mt-5 space-y-3">
              <button type="button" onClick={handlePay} disabled={!hasEnoughBalance} className="btn-primary">
                Pay {requesterName} {formatNgn(requestAmountNgn)}
              </button>
              <button type="button" onClick={handleDecline} className="btn-ghost">
                Not now — decline
              </button>
            </div>
          </div>
        </StepPanel>
      )}

      {step === "sending" && (
        <StepPanel stepKey="sending">
          <ProcessingView
            title={`Paying ${formatNgn(requestAmountNgn)}`}
            subtitle={`Settling up with ${requesterName}…`}
            from={<Avatar name={myName} seed={currentUserWallet} size="lg" />}
            to={<Avatar name={requesterName} seed={requester?.walletAddress} size="lg" />}
          />
        </StepPanel>
      )}

      {step === "success" && transaction && (
        <StepPanel stepKey="success">
          <SuccessView
            title="All settled!"
            actions={
              <button type="button" onClick={handleClose} className="btn-primary">
                Back to {group.name}
              </button>
            }
          >
            You paid {requesterName} <span className="tabular font-bold text-ink">{formatNgn(requestAmountNgn)}</span>
            {request.note ? ` for ${request.note.toLowerCase()}` : ""}.
          </SuccessView>
        </StepPanel>
      )}

      {step === "error" && (
        <StepPanel stepKey="error">
          <ErrorView message={error} onRetry={() => setStep("confirm")} onClose={handleClose} />
        </StepPanel>
      )}
    </Sheet>
  );
}
