import "server-only";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, getSignedAssetUrl } from "@/lib/storage/r2";
import { getLessonPolicyTypeLabel } from "@/lib/autoscuole/lesson-policy";

const TIMEZONE = "Europe/Rome";
const BRAND_BLUE = "#1E3A5F";
const MUTED = "#64748b";
const SEPARATOR = "#E2E8F0";
const BG_LIGHT = "#F8FAFC";

const toItDate = (date: Date) =>
  date.toLocaleDateString("it-IT", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const toItDateTime = (date: Date) =>
  date.toLocaleString("it-IT", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatEur = (amount: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);

export type ReceiptData = {
  appointmentId: string;
  companyName: string;
  studentName: string;
  studentEmail: string;
  lessonType: string;
  startsAt: Date;
  /** Amount in EUR (e.g. 25.00) */
  paidAmount: number;
  paidAt: Date | null;
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
  },
  // ── Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  brandName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2,
  },
  docTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    textAlign: "right",
  },
  docRef: {
    fontSize: 9,
    color: MUTED,
    textAlign: "right",
    marginTop: 3,
  },
  // ── Separator
  sep: {
    borderBottomWidth: 1,
    borderBottomColor: SEPARATOR,
    marginVertical: 16,
  },
  // ── Section header label
  sectionLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  sectionValue: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 1,
  },
  sectionSub: {
    fontSize: 9.5,
    color: MUTED,
  },
  // ── Row (label : value)
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  rowLabel: {
    fontSize: 9.5,
    color: MUTED,
    width: 120,
  },
  rowValue: {
    fontSize: 9.5,
    color: "#111827",
    flex: 1,
  },
  // ── Amount box
  amountBox: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: SEPARATOR,
    marginTop: 8,
    marginBottom: 8,
  },
  amountBoxLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  amountBoxValue: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
  },
  amountBoxMeta: {
    fontSize: 9,
    color: MUTED,
    marginTop: 6,
  },
  // ── Footer
  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: SEPARATOR,
  },
  footerBold: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textAlign: "center",
    marginBottom: 2,
  },
  footerText: {
    fontSize: 8.5,
    color: MUTED,
    textAlign: "center",
    marginBottom: 2,
  },
  disclaimer: {
    fontSize: 7.5,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 1.4,
  },
  // ── Two-column grid
  cols: {
    flexDirection: "row",
  },
  col: {
    flex: 1,
    paddingRight: 16,
  },
});

const ReceiptDocument: React.FC<{ data: ReceiptData }> = ({ data }) => {
  const receiptRef = `APT-${data.appointmentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const lessonTypeLabel = getLessonPolicyTypeLabel(data.lessonType);

  return (
    <Document title={`Ricevuta ${receiptRef}`} author="Reglo" creator="Reglo">
      <Page size="A4" style={s.page}>
        {/* ── Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>REGLO</Text>
            <Text style={s.brandTagline}>Piattaforma gestione autoscuole</Text>
          </View>
          <View>
            <Text style={s.docTitle}>RICEVUTA DI PAGAMENTO</Text>
            <Text style={s.docRef}>N. rif: {receiptRef}</Text>
            <Text style={s.docRef}>Emessa il: {toItDate(new Date())}</Text>
          </View>
        </View>

        <View style={s.sep} />

        {/* ── Autoscuola + Studente */}
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>AUTOSCUOLA</Text>
            <Text style={s.sectionValue}>{data.companyName}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>STUDENTE</Text>
            <Text style={s.sectionValue}>{data.studentName}</Text>
            <Text style={s.sectionSub}>{data.studentEmail}</Text>
          </View>
        </View>

        <View style={s.sep} />

        {/* ── Dettaglio lezione */}
        <Text style={s.sectionLabel}>DETTAGLIO LEZIONE</Text>
        <View style={s.row}>
          <Text style={s.rowLabel}>Tipo guida</Text>
          <Text style={s.rowValue}>{lessonTypeLabel}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Data e ora</Text>
          <Text style={s.rowValue}>{toItDateTime(data.startsAt)}</Text>
        </View>

        <View style={s.sep} />

        {/* ── Importo */}
        <View style={s.amountBox}>
          <Text style={s.amountBoxLabel}>IMPORTO PAGATO</Text>
          <Text style={s.amountBoxValue}>{formatEur(data.paidAmount)}</Text>
          {data.paidAt ? (
            <Text style={s.amountBoxMeta}>
              Pagamento del {toItDateTime(data.paidAt)}
            </Text>
          ) : null}
          <Text style={s.amountBoxMeta}>Carta di credito</Text>
        </View>

        {/* ── Footer */}
        <View style={s.footer}>
          <Text style={s.footerBold}>Reglo — www.reglo.app</Text>
          <Text style={s.footerText}>
            Documento generato automaticamente dalla piattaforma Reglo.
          </Text>
          <Text style={s.disclaimer}>
            {
              "Questa ricevuta attesta il pagamento effettuato tramite la piattaforma Reglo.\nNon costituisce documento fiscale ai sensi di legge. Per la fattura fiscale contatta direttamente l'autoscuola."
            }
          </Text>
        </View>
      </Page>
    </Document>
  );
};

/**
 * Generates a PDF receipt for an appointment payment and uploads it to R2.
 * Returns the public/signed URL of the uploaded file.
 */
export async function generateAndUploadReceipt(data: ReceiptData): Promise<string> {
  // eslint-disable-next-line react/react-in-jsx-scope
  const buffer = await renderToBuffer(<ReceiptDocument data={data} />);

  const key = `receipts/appointments/${data.appointmentId}.pdf`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      ContentDisposition: `inline; filename="ricevuta-${data.appointmentId.slice(0, 8)}.pdf"`,
    }),
  );

  return getSignedAssetUrl(key, 7 * 24 * 3600); // 7 days
}
