import { useState } from 'react'
import { X, Send, Mail, MessageSquare, Check, Sparkles } from 'lucide-react'
import { InitialsAvatar } from '../components/InitialsAvatar'

export interface BulkSendItem {
  id: string
  tenant: string
  unit: string
  amount: string
  amountValue: number
  cycle: string
  cycleDate: string
  status: 'Paid' | 'Pending'
}

export function BulkSendInvoicesDialog({
  items,
  onClose,
  onSent,
}: {
  items: BulkSendItem[]
  onClose: () => void
  onSent: () => void
}) {
  const [sendEmail, setSendEmail] = useState(true)
  const [sendLine, setSendLine] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)

  const totalAmount = items.reduce((acc, item) => acc + (item.amountValue || 0), 0)

  async function handleSend() {
    setIsSending(true)
    // Simulate async dispatch
    await new Promise((resolve) => setTimeout(resolve, 600))
    setIsSending(false)
    setIsSent(true)
    setTimeout(() => {
      onSent()
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send Invoices"
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.6)] bg-white shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0ece6] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#fcd5d5] text-[#7a5457]">
              <Send size={18} />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-[#2b2a26]">
                Send Invoices to Tenants
              </h2>
              <p className="text-xs text-[#767065]">
                Review and confirm bulk invoice delivery for {items.length} {items.length === 1 ? 'resident' : 'residents'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-[#767065] hover:bg-black/5 hover:text-[#2b2a26] cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-[#2b2a26]">
          {/* Summary Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eed9c4] bg-[#faf9f8] p-4">
            <div>
              <p className="text-[11px] font-semibold text-[#767065] uppercase tracking-wider">
                Total Invoices to Dispatch
              </p>
              <p className="font-heading text-2xl font-bold text-[#2b2a26] mt-0.5">
                {items.length} <span className="text-xs font-normal text-[#767065]">Invoices</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold text-[#767065] uppercase tracking-wider">
                Total Value
              </p>
              <p className="font-heading text-xl font-bold text-[#5a3036] mt-0.5">
                ¥{totalAmount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Delivery Channels */}
          <div className="rounded-xl border border-[#eed9c4]/60 bg-white p-4 space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#767065]">
              Delivery Channels
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 rounded-lg border border-[#eed9c4]/70 p-3 bg-[#faf9f8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="size-4 rounded accent-[#5a3036]"
                />
                <Mail size={16} className="text-[#5a3036]" />
                <span className="font-medium text-[#2b2a26]">Email (PDF attached)</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-[#eed9c4]/70 p-3 bg-[#faf9f8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendLine}
                  onChange={(e) => setSendLine(e.target.checked)}
                  className="size-4 rounded accent-[#5a3036]"
                />
                <MessageSquare size={16} className="text-[#2e7d32]" />
                <span className="font-medium text-[#2b2a26]">LINE Official Alert</span>
              </label>
            </div>
          </div>

          {/* Recipient List */}
          <div className="space-y-2">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#767065]">
              Recipients ({items.length})
            </h3>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#f0ece6] rounded-xl border border-[#eed9c4]/60 bg-white">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 transition hover:bg-[#faf9f8]">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={item.tenant} size={36} />
                    <div>
                      <p className="font-bold text-xs text-[#2b2a26]">{item.tenant}</p>
                      <p className="text-[11px] text-[#767065]">
                        {item.unit} · {item.cycleDate} ({item.cycle})
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xs text-[#2b2a26]">¥{item.amount}</p>
                    <span
                      className={`inline-flex items-center rounded-xs px-2 py-0.5 text-[10px] font-medium ${
                        item.status === 'Paid'
                          ? 'bg-[#e8f5e9] text-[#2e7d32]'
                          : 'border border-[rgba(255,224,130,0.5)] bg-[#fff8e1] text-[#f57f17]'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#f0ece6] px-6 py-4 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#e7e0d3] bg-white px-4 py-2 text-xs font-medium text-[#767065] hover:bg-black/5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || (!sendEmail && !sendLine)}
            className="flex items-center gap-2 rounded-lg bg-[#5a3036] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#47262b] disabled:opacity-50 transition cursor-pointer"
          >
            {isSent ? (
              <>
                <Check size={14} /> Sent Successfully!
              </>
            ) : isSending ? (
              <>
                <Sparkles size={14} className="animate-spin" /> Dispatching...
              </>
            ) : (
              <>
                <Send size={14} /> Send {items.length} {items.length === 1 ? 'Invoice' : 'Invoices'} Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
