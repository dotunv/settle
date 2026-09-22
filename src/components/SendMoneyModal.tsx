"use client";

import { useState, useEffect } from "react";

import { Group, Transaction } from "@/lib/types";
import { createTransaction, updateMemberBalance } from "@/lib/db";
import { generateMockTxHash, formatNgn, getNgnRate } from "@/lib/currency";
import { Sheet, SheetHeader, StepPanel } from "./ui/Sheet";
import { AmountInput } from "./ui/AmountInput";
import { MemberPicker } from "./ui/MemberPicker";
import { Avatar, memberName } from "./ui/Avatar";
import { ProcessingView, SuccessView, ErrorView } from "./ui/Status";
import { BoltIcon } from "./ui/Icons";

interface SendMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group;
  currentUserWallet: string;
  onSuccess: () => void;
}

type SendStep = "form" | "confirm" | "sending" | "success" | "error";

export function SendMoneyModal({
  isOpen,
  onClose,
  group,
  currentUserWallet,
  onSuccess,
}: SendMoneyModalProps) {
  const rate = getNgnRate();
  const [step, setStep] = useState<SendStep>("form");
  const [amount, setAmount] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [showCashOut, setShowCashOut] = useState(false);

  const currentMember = group.members.find(
    (m) => m.walletAddress.toLowerCase() === currentUserWallet.toLowerCase()
  );
  const otherMembers = group.members.filter(
    (m) => m.walletAddress.toLowerCase() !== currentUserWallet.toLowerCase()
  );

  const currentBalanceUsdc = parseFloat(currentMember?.balance.usdc || "0");
  const currentBalanceNgn = currentBalanceUsdc * rate;
  const ngnAmount = parseFloat(amount) || 0;
  const usdcAmount = ngnAmount / rate;
  const selectedMember = otherMembers.find((m) => m.id === selectedMemberId);
  const recipientName = selectedMember ? memberName(selectedMember) : "them";
  const myName = memberName(currentMember);

  const overBalance = ngnAmount > 0 && usdcAmount > currentBalanceUsdc;
  const isValidForm = ngnAmount > 0 && !overBalance && !!selectedMemberId;

  const handleContinue = () => {
    if (!selectedMemberId) {
      setError("Pick who you're sending to");
      return;
    }
    if (!isValidForm) return;
    setError("");
    setStep("confirm");
  };

  const handleSend = async () => {
    setStep("sending");
    setError("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const txHash = generateMockTxHash();
      const recipientAddress = selectedMember?.walletAddress || "";

      const newTx = await createTransaction({
        groupId: group.id,
        type: "send",
        fromAddress: currentUserWallet,
        toAddress: recipientAddress,
        amountUsdc: usdcAmount.toFixed(6),
        amountNgn: ngnAmount.toFixed(0),
        txHash,
        status: "confirmed",
      });

      const newSenderBalance = (currentBalanceUsdc - usdcAmount).toFixed(6);
      await updateMemberBalance(group.id, currentUserWallet, newSenderBalance);

      if (selectedMember) {
        const recipientBalance = parseFloat(selectedMember.balance.usdc || "0");
        const newRecipientBalance = (recipientBalance + usdcAmount).toFixed(6);
        await updateMemberBalance(group.id, selectedMember.walletAddress, newRecipientBalance);
      }

      setTransaction(newTx);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  };

  const reset = () => {
    setStep("form");
    setAmount("");
    setSelectedMemberId("");
    setTransaction(null);
    setError("");
    setShowCashOut(false);
  };

  const handleClose = () => {
    if (step === "success") onSuccess();
    reset();
    onClose();
  };

  const sendAnother = () => {
    onSuccess();
    reset();
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

  // Auto-select when there's only one person to send to
  useEffect(() => {
    if (isOpen && otherMembers.length === 1 && !selectedMemberId) {
      setSelectedMemberId(otherMembers[0].id);
    }
  }, [isOpen, otherMembers, selectedMemberId]);

  return (
    <Sheet isOpen={isOpen} onClose={handleClose} label="Send money" locked={step === "sending"}>
      {step === "form" && (
        <StepPanel stepKey="form">
          <SheetHeader title="Send money" onClose={handleClose} step={1} totalSteps={2} />
          <div className="space-y-6 px-5 pb-5 pt-3">
            <AmountInput
              label="How much?"
              value={amount}
              onChange={setAmount}
              error={overBalance ? `You only have ${formatNgn(currentBalanceNgn)} available` : null}
              hint={
                <>
                  Available <span className="tabular font-semibold text-ink">{formatNgn(currentBalanceNgn)}</span>
                </>
              }
            />

            <MemberPicker
              label="Send to"
              members={otherMembers}
              selectedId={selectedMemberId}
              onSelect={(id) => {
                setSelectedMemberId(id);
                setError("");
              }}
              error={error}
            />

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream p-4">
              <input
                type="checkbox"
                checked={showCashOut}
                onChange={(e) => setShowCashOut(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-ink/20 text-primary-600 accent-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Cash out to their bank (demo)</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                  In the full product this lands in a bank account or mobile money. In the demo, it updates their balance.
                </span>
              </span>
            </label>

            <button type="button" onClick={handleContinue} disabled={!isValidForm} className="btn-primary">
              {ngnAmount > 0 && selectedMember
                ? `Continue · ${formatNgn(ngnAmount)} to ${recipientName}`
                : "Continue"}
            </button>
          </div>
        </StepPanel>
      )}

      {step === "confirm" && (
        <StepPanel stepKey="confirm">
          <SheetHeader title="Check and send" onBack={() => setStep("form")} step={2} totalSteps={2} />
          <div className="px-5 pb-5 pt-3">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 p-6 text-center text-white shadow-glow">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sun-300/30 blur-2xl" />
              <div className="relative flex items-center justify-center gap-3">
                <Avatar name={myName} seed={currentUserWallet} size="md" ring />
                <div className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white [animation-delay:300ms]" />
                </div>
                <Avatar name={recipientName} seed={selectedMember?.walletAddress} size="md" ring />
              </div>
              <p className="relative mt-4 text-sm font-medium text-primary-100">You&apos;re sending</p>
              <p className="tabular relative mt-1 font-display text-5xl font-extrabold tracking-tight">
                {formatNgn(ngnAmount)}
              </p>
              <p className="relative mt-2 text-base font-semibold">to {recipientName}</p>
            </div>

            <dl className="mt-5 divide-y divide-ink/5 rounded-2xl bg-cream px-4">
              <Row label={`${recipientName} gets`} value={formatNgn(ngnAmount)} strong />
              <Row label="Fee" value="₦0" />
              <Row label="Arrives" value={<span className="inline-flex items-center gap-1"><BoltIcon size={14} className="text-sun-500" /> In seconds</span>} />
              {showCashOut && <Row label="Cash out" value="To bank (demo)" />}
              <Row label="Your balance after" value={formatNgn(currentBalanceNgn - ngnAmount)} />
            </dl>

            <button type="button" onClick={handleSend} className="btn-primary mt-5">
              {showCashOut ? `Send & cash out ${formatNgn(ngnAmount)}` : `Send ${formatNgn(ngnAmount)}`}
            </button>
          </div>
        </StepPanel>
      )}

      {step === "sending" && (
        <StepPanel stepKey="sending">
          <ProcessingView
            title={`Sending ${formatNgn(ngnAmount)}`}
            subtitle={`On its way to ${recipientName}…`}
            from={<Avatar name={myName} seed={currentUserWallet} size="lg" />}
            to={<Avatar name={recipientName} seed={selectedMember?.walletAddress} size="lg" />}
          />
        </StepPanel>
      )}

      {step === "success" && transaction && (
        <StepPanel stepKey="success">
          <SuccessView
            title="Sent!"
            actions={
              <>
                <button type="button" onClick={handleClose} className="btn-primary">
                  Back to {group.name}
                </button>
                <button type="button" onClick={sendAnother} className="btn-ghost">
                  Send more money
                </button>
              </>
            }
          >
            <span className="tabular font-bold text-ink">{formatNgn(ngnAmount)}</span> is with {recipientName}.
            <br />
            <span className="text-sm text-ink-muted">
              {showCashOut ? "Cash out started (demo)." : "They can cash out whenever they're ready."}
            </span>
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

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`tabular ${strong ? "font-bold text-ink" : "font-semibold text-ink-soft"}`}>{value}</dd>
    </div>
  );
}
