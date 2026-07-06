"use client";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { marginBottom: 20 },
  storeName: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 11, color: "#64748b" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  table: { width: "100%" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 4 },
  rowAlt: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 4, backgroundColor: "#f8fafc" },
  rowTotal: { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1.5, borderTopColor: "#94a3b8", marginTop: 2 },
  rowProfit: { flexDirection: "row", paddingVertical: 5 },
  th: { fontFamily: "Helvetica-Bold", color: "#64748b", fontSize: 9 },
  col1: { flex: 2 },
  col2: { flex: 2, textAlign: "right" },
  col3: { flex: 2, textAlign: "right" },
  col4: { flex: 2, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  green: { fontFamily: "Helvetica-Bold", color: "#15803d" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginBottom: 16 },
  vendorRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  vendorName: { flex: 3, fontFamily: "Helvetica-Bold" },
  vendorAmt: { flex: 2, textAlign: "right" },
  lotteryCol1: { flex: 3 },
  lotteryCol2: { flex: 2, textAlign: "right" },
  summaryRow: { flexDirection: "row", paddingVertical: 3 },
  summaryLabel: { flex: 3, color: "#64748b" },
  summaryValue: { flex: 2, textAlign: "right" },
});

interface Entry { entry_date: string; income: number; payouts: number; tax: number; }
interface LotteryEntry { id: string; week_start: string; week_end: string; amount: number; }
interface VendorPayment { id: string; vendor_id: string; amount: number; payment_date: string; vendors: { name: string }; }

interface Props {
  storeName: string;
  month: number;
  year: number;
  entries: Entry[];
  allDays: { date: string; entry: Entry | null }[];
  vendorPayments: VendorPayment[];
  lotteryEntries: LotteryEntry[];
  totals: { income: number; tax: number; payout: number };
  vendorPayoutTotal: number;
  lotteryTotal: number;
  profit: number;
}

export default function BookkeepingPDF({
  storeName, month, year, allDays, vendorPayments, lotteryEntries,
  totals, vendorPayoutTotal, lotteryTotal, profit,
}: Props) {
  const groupedPayments = vendorPayments.reduce((acc, p) => {
    const name = p.vendors?.name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(p);
    return acc;
  }, {} as Record<string, VendorPayment[]>);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.storeName}>{storeName}</Text>
          <Text style={s.subtitle}>{MONTHS[month - 1]} {year} — Monthly Bookkeeping Report</Text>
        </View>

        {/* Daily Entries */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Daily Entries</Text>
          <View style={s.table}>
            <View style={s.row}>
              <Text style={[s.col1, s.th]}>Date</Text>
              <Text style={[s.col2, s.th]}>Income</Text>
              <Text style={[s.col3, s.th]}>Tax</Text>
              <Text style={[s.col4, s.th]}>Payout</Text>
            </View>
            {allDays.map(({ date, entry }, i) => (
              <View key={date} style={i % 2 === 0 ? s.row : s.rowAlt}>
                <Text style={s.col1}>{date}</Text>
                <Text style={s.col2}>{entry ? `$${entry.income.toFixed(2)}` : "—"}</Text>
                <Text style={s.col3}>{entry ? `$${entry.tax.toFixed(2)}` : "—"}</Text>
                <Text style={s.col4}>{entry ? `$${entry.payouts.toFixed(2)}` : "—"}</Text>
              </View>
            ))}
            <View style={s.rowTotal}>
              <Text style={[s.col1, s.bold]}>Totals</Text>
              <Text style={[s.col2, s.bold]}>${totals.income.toFixed(2)}</Text>
              <Text style={[s.col3, s.bold]}>${totals.tax.toFixed(2)}</Text>
              <Text style={[s.col4, s.bold]}>${totals.payout.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Vendor Payments */}
        {Object.keys(groupedPayments).length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Vendor Payments</Text>
            <View style={s.table}>
              {Object.entries(groupedPayments).map(([name, payments]) => {
                const subtotal = payments.reduce((sum, p) => sum + p.amount, 0);
                return (
                  <View key={name} style={s.vendorRow}>
                    <Text style={s.vendorName}>{name}</Text>
                    <Text style={s.vendorAmt}>${subtotal.toFixed(2)}</Text>
                  </View>
                );
              })}
              <View style={s.rowTotal}>
                <Text style={[s.vendorName, s.bold]}>Total Vendor Payouts</Text>
                <Text style={[s.vendorAmt, s.bold]}>${vendorPayoutTotal.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Lottery */}
        {lotteryEntries.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Lottery</Text>
            <View style={s.table}>
              {lotteryEntries.map(e => (
                <View key={e.id} style={s.vendorRow}>
                  <Text style={s.lotteryCol1}>{e.week_start} — {e.week_end}</Text>
                  <Text style={s.lotteryCol2}>${e.amount.toFixed(2)}</Text>
                </View>
              ))}
              <View style={s.rowTotal}>
                <Text style={[s.lotteryCol1, s.bold]}>Total Lottery</Text>
                <Text style={[s.lotteryCol2, s.bold]}>${lotteryTotal.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Summary */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Summary</Text>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total Income</Text>
            <Text style={s.summaryValue}>${totals.income.toFixed(2)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Lottery Income</Text>
            <Text style={s.summaryValue}>${lotteryTotal.toFixed(2)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total Payouts</Text>
            <Text style={s.summaryValue}>${(totals.payout + vendorPayoutTotal).toFixed(2)}</Text>
          </View>
          <View style={[s.summaryRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 4 }]}>
            <Text style={[s.summaryLabel, s.green]}>Net Profit</Text>
            <Text style={[s.summaryValue, s.green]}>${profit.toFixed(2)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
