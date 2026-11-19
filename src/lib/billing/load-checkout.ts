"use client";

export type CheckoutSuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

export type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  handler: (response: CheckoutSuccess) => void;
  modal?: { ondismiss?: () => void };
};

type CheckoutInstance = {
  open(): void;
  on(event: "payment.failed", callback: () => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => CheckoutInstance;
  }
}

/** The one message from this file that is plain enough to show a person. */
export const CHECKOUT_LOAD_FAILED = "Could not open the payment window.";

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

/** Loads Razorpay Checkout once per page; a failed load can be tried again. */
export function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error(CHECKOUT_LOAD_FAILED));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export function openCheckout(options: CheckoutOptions, onFailed: () => void): void {
  if (!window.Razorpay) throw new Error(CHECKOUT_LOAD_FAILED);
  const checkout = new window.Razorpay(options);
  checkout.on("payment.failed", onFailed);
  checkout.open();
}
