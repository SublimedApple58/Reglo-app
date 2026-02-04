export const normalizeWhatsapp = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
};

export const sendAutoscuolaWhatsApp = async ({
  to,
  body,
}: {
  to: string;
  body: string;
}) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    throw new Error("TWILIO_* env non configurate (WhatsApp)");
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: normalizeWhatsapp(from),
        To: normalizeWhatsapp(to),
        Body: body,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio error: ${res.status} ${text.slice(0, 120)}`);
  }
};
