"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  description: string | null;
  created_at: string;
};

type Resp = {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed?.(2) ?? amount} ${currency?.toUpperCase?.() || "USD"}`;
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function BillingHistory() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 10;

  const fetchPage = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stripe/payment-history?page=${p}&pageSize=${pageSize}`, { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}): ${t}`);
      }
      const json = (await res.json()) as Resp;
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(page);
  }, [page]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium">Billing history</h2>
        <div className="text-sm text-gray-500">
          {total > 0 ? `${total} record${total === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-600 mb-2">{error}</div>
      )}

      {loading && !items.length ? (
        <div className="text-sm text-gray-600 dark:text-gray-400">Loading…</div>
      ) : !items.length ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">No billing records yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Invoice</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{formatDate(it.created_at)}</td>
                  <td className="py-2 pr-3 font-medium">{formatMoney(it.amount, it.currency)}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ring-gray-300 dark:ring-gray-600">
                      {(it.status || "").replace(/_/g, " ") || "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {it.stripe_invoice_id ? (
                      <a
                        className="text-emerald-700 dark:text-emerald-400 hover:underline"
                        href={`https://dashboard.stripe.com${process.env.NODE_ENV !== "production" ? "/test" : ""}/invoices/${it.stripe_invoice_id}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {it.stripe_invoice_id}
                      </a>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-2 max-w-[280px] truncate text-gray-700 dark:text-gray-300">{it.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-gray-500">
          Page {data?.page ?? page} of {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
            disabled={loading || (data ? !data.hasPrev : page <= 1)}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
            disabled={loading || (data ? !data.hasNext : false)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

