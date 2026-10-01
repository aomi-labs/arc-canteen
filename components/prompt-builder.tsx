"use client";

import { useState } from "react";
import { CodeWindow } from "@/components/code-window";

export function PromptBuilder() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [copied, setCopied] = useState(false);
  const validAddress = /^0x[a-fA-F0-9]{40}$/.test(recipient.trim());
  const validAmount = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount.trim()) &&
    Number(amount) > 0;
  const valid = validAddress && validAmount;
  const prompt = valid
    ? `On Arc Testnet (chain ID 5042002), prepare a transfer of ${amount.trim()} USDC to ${recipient.trim()}. Simulate the exact transaction and show me the chain, recipient, amount, gas and any warnings. Stop before signing and wait for my review.`
    : "Enter a valid Arc Testnet recipient and a positive USDC amount to prepare your prompt.";

  async function copyPrompt() {
    if (!valid) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="prompt-builder">
      <p className="prompt-builder-title">Your prompt</p>
      <div className="prompt-fields">
        <label>
          Arc Testnet recipient
          <input
            value={recipient}
            onChange={(event) => { setRecipient(event.target.value); setCopied(false); }}
            placeholder="0x..."
            spellCheck={false}
            autoComplete="off"
            aria-invalid={recipient.length > 0 && !validAddress}
          />
        </label>
        <label>
          Amount in test USDC
          <input
            value={amount}
            onChange={(event) => { setAmount(event.target.value); setCopied(false); }}
            inputMode="decimal"
            aria-invalid={amount.length > 0 && !validAmount}
          />
        </label>
      </div>
      {recipient && !validAddress ? <p className="prompt-error">Use a full 0x-prefixed EVM address.</p> : null}
      {amount && !validAmount ? <p className="prompt-error">Enter a positive amount with at most six decimal places.</p> : null}
      <div aria-live="polite">
        <CodeWindow code={prompt} title="prompt" />
      </div>
      <button className="copy-button" type="button" disabled={!valid} onClick={copyPrompt}>
        {copied ? "Copied" : "Copy prompt"}
      </button>
    </div>
  );
}
