import re

with open('frontend/src/pages/Suppliers.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

new_jsx = """              {formError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-xl flex items-start gap-2">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs font-semibold text-red-700">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSettle} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Select POs to Pay</label>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y">
                    {unpaidPOs.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">No unpaid POs found.</div>
                    ) : (
                      unpaidPOs.map(po => {
                        const balance = Number(po.total_amount) - Number(po.amount_paid || 0);
                        const isSelected = selectedPOs[po.id] !== undefined;
                        return (
                          <div key={po.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPOs(prev => ({ ...prev, [po.id]: balance }));
                                  } else {
                                    const next = { ...prev };
                                    delete next[po.id];
                                    setSelectedPOs(next);
                                  }
                                }}
                                className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary" 
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-700">{po.po_number}</p>
                                <p className="text-xs text-slate-500">Balance: LKR {balance.toLocaleString()}</p>
                              </div>
                            </div>
                            {isSelected && (
                              <input 
                                type="number" min="0.01" max={balance} step="0.01" required
                                value={selectedPOs[po.id] || ''}
                                onChange={e => setSelectedPOs(prev => ({ ...prev, [po.id]: Number(e.target.value) }))}
                                className="w-24 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Total Payment Amount (LKR) *</label>
                  <input
                    type="number" min="0.01" step="0.01" required
                    value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-slate-400">Allocated: LKR {Object.values(selectedPOs).reduce((a,b)=>a+b, 0).toLocaleString()}</p>
                </div>"""

# Ensure we use raw strings to match the literal regex
code = re.sub(
    r'\{formError && \([\s\S]*?className="w-full px-3\.5 py-2\.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"\s*\/>\s*<\/div>',
    new_jsx,
    code
)

with open('frontend/src/pages/Suppliers.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print('Done')
