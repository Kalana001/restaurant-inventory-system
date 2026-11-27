import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  Percent, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Save, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import type { MenuItem } from '../pages/DailySalesEntry';
import type { ChannelPriceMap } from '../lib/channelPrices';

interface PickMePricingCalculatorProps {
  menuItems: MenuItem[];
  channelPrices: ChannelPriceMap;
  onApplyPrices: (updatedPrices: ChannelPriceMap) => Promise<void>;
  onClose?: () => void;
}

export const PickMePricingCalculator: React.FC<PickMePricingCalculatorProps> = ({
  menuItems,
  channelPrices,
  onApplyPrices,
  onClose
}) => {
  // Global settings
  const [globalProfitMargin, setGlobalProfitMargin] = useState<number>(5.0); // Default +5%
  const [customMarginInput, setCustomMarginInput] = useState<string>('5.0');
  const [roundingMode, setRoundingMode] = useState<'NEAREST_10' | 'NEAREST_50' | 'CEIL' | 'EXACT'>('NEAREST_10');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Per-item custom profit overrides: { [item_code]: number }
  const [itemProfitOverrides, setItemProfitOverrides] = useState<Record<string, number>>({});

  // Applying state
  const [applying, setApplying] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);
  const [confirmApplyModal, setConfirmApplyModal] = useState<boolean>(false);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach(item => {
      if (item.category) set.add(item.category.trim());
    });
    return Array.from(set).sort();
  }, [menuItems]);

  // Rounding helper
  const roundPrice = (val: number, mode: typeof roundingMode): number => {
    if (val <= 0) return 0;
    switch (mode) {
      case 'NEAREST_10':
        return Math.round(val / 10) * 10;
      case 'NEAREST_50':
        return Math.round(val / 50) * 50;
      case 'CEIL':
        return Math.ceil(val);
      case 'EXACT':
      default:
        return Math.round(val * 100) / 100;
    }
  };

  // Format currency
  const formatLKR = (num: number) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Calculate items with formulas
  const calculatedItems = useMemo(() => {
    return menuItems.map(item => {
      const restPrice = Number(item.restaurant_price) || 0;
      const currentPickmePrice = Number(item.pickme_price) || 0;

      // Break-even formula: restPrice / 0.70
      const rawBreakEven = restPrice > 0 ? restPrice / 0.70 : 0;
      const breakEvenPrice = roundPrice(rawBreakEven, roundingMode);

      // Profit percentage for this item (custom override or global)
      const profitMargin = itemProfitOverrides[item.item_code] !== undefined
        ? itemProfitOverrides[item.item_code]
        : globalProfitMargin;

      // Target formula: (restPrice * (1 + profitMargin / 100)) / 0.70
      const targetCashRetained = restPrice * (1 + profitMargin / 100);
      const rawTarget = restPrice > 0 ? targetCashRetained / 0.70 : 0;
      const targetPickmePrice = roundPrice(rawTarget, roundingMode);

      // PickMe commission (30%) & actual net cash retained (70%)
      const pickmeCommissionCut = targetPickmePrice * 0.30;
      const netCashReceived = targetPickmePrice * 0.70;
      const netProfitOverDineIn = netCashReceived - restPrice;

      // Current PickMe health evaluation
      const currentNetCash = currentPickmePrice * 0.70;
      const currentLossOrGain = currentNetCash - restPrice;
      const isUnset = currentPickmePrice === restPrice;
      const isLoss = !isUnset && currentLossOrGain < -0.5;
      const isProfit = !isUnset && currentLossOrGain >= 0.5;
      const isBreakEven = !isUnset && Math.abs(currentLossOrGain) < 0.5;

      return {
        ...item,
        restPrice,
        currentPickmePrice,
        breakEvenPrice,
        profitMargin,
        targetPickmePrice,
        pickmeCommissionCut,
        netCashReceived,
        netProfitOverDineIn,
        currentNetCash,
        currentLossOrGain,
        isUnset,
        isLoss,
        isProfit,
        isBreakEven
      };
    });
  }, [menuItems, roundingMode, globalProfitMargin, itemProfitOverrides]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return calculatedItems.filter(item => {
      const matchesCat = selectedCategory === 'ALL' || item.category.trim() === selectedCategory;
      const matchesSearch = searchQuery === '' || 
        item.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [calculatedItems, selectedCategory, searchQuery]);

  // High-level summary stats
  const stats = useMemo(() => {
    let lossCount = 0;
    let profitCount = 0;
    let unsetCount = 0;
    let breakEvenCount = 0;

    calculatedItems.forEach(i => {
      if (i.isUnset) unsetCount++;
      else if (i.isLoss) lossCount++;
      else if (i.isProfit) profitCount++;
      else breakEvenCount++;
    });

    return {
      total: calculatedItems.length,
      lossCount,
      profitCount,
      unsetCount,
      breakEvenCount
    };
  }, [calculatedItems]);

  // Handle applying calculated prices to channel prices
  const handleConfirmApply = async () => {
    setApplying(true);
    try {
      const updatedMap: ChannelPriceMap = { ...channelPrices };
      calculatedItems.forEach(item => {
        if (item.targetPickmePrice > 0) {
          updatedMap[item.item_code] = {
            restaurant_price: item.restPrice,
            pickme_price: item.targetPickmePrice,
            updated_at: new Date().toISOString()
          };
        }
      });

      await onApplyPrices(updatedMap);
      setConfirmApplyModal(false);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to apply calculated prices');
    } finally {
      setApplying(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Item Code',
      'Dish Name',
      'Category',
      'Restaurant Dine-in Price (LKR)',
      'Current PickMe Price (LKR)',
      'Break-Even Price (LKR)',
      `Target Profit %`,
      `Target PickMe Price (${globalProfitMargin}% Margin) (LKR)`,
      'PickMe 30% Cut (LKR)',
      'Net Cash to Restaurant (LKR)',
      'Net Profit Over Dine-in (LKR)'
    ];

    const rows = calculatedItems.map(i => [
      `"${i.item_code}"`,
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.category}"`,
      i.restPrice.toFixed(2),
      i.currentPickmePrice.toFixed(2),
      i.breakEvenPrice.toFixed(2),
      `${i.profitMargin.toFixed(1)}%`,
      i.targetPickmePrice.toFixed(2),
      i.pickmeCommissionCut.toFixed(2),
      i.netCashReceived.toFixed(2),
      i.netProfitOverDineIn.toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PickMe_Pricing_Sheet_${globalProfitMargin}pct_margin.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Formula Explanation */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-emerald-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
              <Calculator size={14} />
              <span>PickMe 30% Commission Protection & Profit Calculator</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Zero-Loss PickMe Menu Price Simulator
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              When PickMe deducts <span className="text-amber-300 font-bold">30% commission</span>, you retain <span className="text-emerald-300 font-bold">70%</span> of the selling price. 
              To cover your costs and never lose money, your baseline PickMe price is calculated with <code className="bg-white/10 px-1.5 py-0.5 rounded text-amber-300 font-bold">Restaurant Price ÷ 0.70</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shadow-sm"
              title="Download full pricing sheet as CSV"
            >
              <Download size={15} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmApplyModal(true)}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/30 active:scale-95"
            >
              <Sparkles size={16} />
              <span>Apply Target Prices to PickMe</span>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {applySuccess && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl flex items-center gap-2 text-emerald-200 text-xs font-bold animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Success! All calculated target prices have been saved and applied to your PickMe channel prices.</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Menu Items</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p>
          <span className="text-[10px] text-slate-400">All active dishes</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs bg-rose-50/20">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Current Loss Items</p>
            <AlertTriangle size={15} className="text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-1">{stats.lossCount}</p>
          <span className="text-[10px] text-rose-600 font-semibold">PickMe price &lt; Break-Even</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs bg-amber-50/20">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Dine-In / Unset</p>
            <ShieldCheck size={15} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-700 mt-1">{stats.unsetCount}</p>
          <span className="text-[10px] text-amber-700 font-semibold">PickMe price = Rest. price</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Target Profit Margin</p>
            <TrendingUp size={15} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-1">+{globalProfitMargin.toFixed(1)}%</p>
          <span className="text-[10px] text-emerald-700 font-semibold">Net profit over Dine-in</span>
        </div>
      </div>

      {/* Control Panel: Profit Margin Selector & Rounding */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <Percent size={14} className="text-primary" />
              <span>Select Desired Profit Margin Above Dine-In:</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: '0% (Break-Even)', val: 0 },
                { label: '+2.5% Profit', val: 2.5 },
                { label: '+5.0% Profit', val: 5.0 },
                { label: '+7.5% Profit', val: 7.5 },
                { label: '+10.0% Profit', val: 10.0 },
                { label: '+15.0% Profit', val: 15.0 }
              ].map(preset => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => {
                    setGlobalProfitMargin(preset.val);
                    setCustomMarginInput(preset.val.toString());
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    globalProfitMargin === preset.val
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              {/* Custom Input */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                <span className="text-xs font-bold text-slate-500">Custom:</span>
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="100"
                  value={customMarginInput}
                  onChange={e => {
                    setCustomMarginInput(e.target.value);
                    const parsed = parseFloat(e.target.value);
                    if (!isNaN(parsed)) {
                      setGlobalProfitMargin(parsed);
                    }
                  }}
                  className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-black text-emerald-800 text-center outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-xs font-black text-slate-600">%</span>
              </div>

              {Object.keys(itemProfitOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setItemProfitOverrides({})}
                  className="text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 ml-2 transition-colors"
                  title="Clear all single-item overrides"
                >
                  <RotateCcw size={12} />
                  <span>Reset Overrides ({Object.keys(itemProfitOverrides).length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Clean Menu Rounding Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Menu Price Rounding Rule:
            </label>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {[
                { id: 'NEAREST_10', label: 'Nearest LKR 10 (Recommended)' },
                { id: 'NEAREST_50', label: 'Nearest LKR 50' },
                { id: 'CEIL', label: 'Round Up (Ceil)' },
                { id: 'EXACT', label: 'Exact Cents' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRoundingMode(opt.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    roundingMode === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search code or dish name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
            />
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Categories ({calculatedItems.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Pricing Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Code & Dish Name</th>
                <th className="px-4 py-3 text-right">Restaurant Dine-In</th>
                <th className="px-4 py-3 text-right">Current PickMe</th>
                <th className="px-4 py-3 text-center">Current Status</th>
                <th className="px-4 py-3 text-right bg-emerald-50/50 text-emerald-900 border-x border-emerald-100">
                  Break-Even PickMe (÷ 0.70)
                </th>
                <th className="px-4 py-3 text-center">Profit %</th>
                <th className="px-4 py-3 text-right bg-emerald-100/70 text-emerald-950 font-black">
                  Target PickMe Price
                </th>
                <th className="px-4 py-3 text-right text-slate-500">PickMe 30% Cut</th>
                <th className="px-4 py-3 text-right font-bold text-emerald-800">You Receive (70%)</th>
                <th className="px-4 py-3 text-right">Net vs Dine-In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    No items match your search.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Item Name */}
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          #{item.item_code}
                        </span>
                        <span>{item.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">{item.category}</span>
                    </td>

                    {/* Restaurant Price */}
                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                      LKR {formatLKR(item.restPrice)}
                    </td>

                    {/* Current PickMe Price */}
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      LKR {formatLKR(item.currentPickmePrice)}
                    </td>

                    {/* Current Health Status */}
                    <td className="px-4 py-3 text-center">
                      {item.isUnset ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          ⚪ Dine-In Only
                        </span>
                      ) : item.isLoss ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={`Current net cash LKR ${formatLKR(item.currentNetCash)} is below dine-in cost.`}>
                          <TrendingDown size={11} />
                          <span>Loss {formatLKR(Math.abs(item.currentLossOrGain))}</span>
                        </span>
                      ) : item.isBreakEven ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          Break-Even
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <TrendingUp size={11} />
                          <span>+{formatLKR(item.currentLossOrGain)}</span>
                        </span>
                      )}
                    </td>

                    {/* Break-Even Price */}
                    <td className="px-4 py-3 text-right font-bold text-emerald-800 bg-emerald-50/50 border-x border-emerald-100">
                      LKR {formatLKR(item.breakEvenPrice)}
                    </td>

                    {/* Target Profit Margin % Input */}
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                        <input
                          type="number"
                          step="0.5"
                          value={item.profitMargin}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setItemProfitOverrides(prev => ({
                              ...prev,
                              [item.item_code]: isNaN(val) ? 0 : val
                            }));
                          }}
                          className="w-12 text-center text-xs font-bold text-slate-800 bg-transparent outline-none"
                        />
                        <span className="text-[10px] font-bold text-slate-400">%</span>
                      </div>
                    </td>

                    {/* Calculated Target PickMe Price */}
                    <td className="px-4 py-3 text-right font-black text-emerald-900 bg-emerald-100/70 text-sm">
                      LKR {formatLKR(item.targetPickmePrice)}
                    </td>

                    {/* PickMe 30% Cut */}
                    <td className="px-4 py-3 text-right text-slate-400 font-medium">
                      -LKR {formatLKR(item.pickmeCommissionCut)}
                    </td>

                    {/* You Receive (Net 70%) */}
                    <td className="px-4 py-3 text-right font-extrabold text-emerald-700">
                      LKR {formatLKR(item.netCashReceived)}
                    </td>

                    {/* Net Gain over Dine-In */}
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={item.netProfitOverDineIn >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                        {item.netProfitOverDineIn >= 0 ? '+' : ''}LKR {formatLKR(item.netProfitOverDineIn)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal: Apply to PickMe Channel */}
      {confirmApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Sparkles size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-800">
                Apply Calculated Prices to PickMe?
              </h3>
              <p className="text-xs text-slate-500">
                This will update the PickMe selling price for all <strong className="text-slate-800">{calculatedItems.length} dishes</strong> based on:
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5 font-medium text-slate-700">
              <div className="flex justify-between">
                <span>Profit Margin:</span>
                <span className="font-bold text-emerald-700">+{globalProfitMargin.toFixed(1)}% above Dine-In</span>
              </div>
              <div className="flex justify-between">
                <span>Commission Protection:</span>
                <span className="font-bold text-slate-800">÷ 0.70 (Covers 30% PickMe cut)</span>
              </div>
              <div className="flex justify-between">
                <span>Rounding:</span>
                <span className="font-bold text-slate-800">{roundingMode}</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              ⚠️ Your current PickMe price list will be updated with these new values. You can review and adjust anytime.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmApplyModal(false)}
                disabled={applying}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={applying}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              >
                {applying ? 'Applying Prices...' : 'Confirm & Apply All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
