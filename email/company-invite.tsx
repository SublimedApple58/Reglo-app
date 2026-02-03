import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

type CompanyInviteEmailProps = {
  companyName: string;
  inviteUrl: string;
  invitedByName?: string | null;
};

export default function CompanyInviteEmail({
  companyName,
  inviteUrl,
  invitedByName,
}: CompanyInviteEmailProps) {
  const primary = '#324D7A';
  const accent = '#AFE2D4';
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'https://app.reglo.it';
  const footerLogo =
    process.env.EMAIL_FOOTER_LOGO ||
    `${serverUrl.replace(/\/$/, '')}/assets/exented_logo.png`;

  return (
    <Html>
      <Preview>Invite to join {companyName}</Preview>
      <Tailwind>
        <Head />
        <Body className="font-sans" style={{ backgroundColor: '#F2FBF8' }}>
          <Container className="max-w-xl">
            <Section
              className="rounded-[28px] overflow-hidden border"
              style={{ borderColor: '#D8ECE7', backgroundColor: '#ffffff' }}
            >
              <Section className="px-6 py-5" style={{ backgroundColor: primary }}>
                <Text className="m-0 text-white text-xs font-semibold uppercase tracking-[0.2em]">
                  Reglo
                </Text>
                <Heading className="m-0 mt-2 text-white text-[22px] font-semibold">
                  Invito a {companyName}
                </Heading>
                <Text className="m-0 mt-2 text-white/90 text-sm">
                  Automations &amp; Docs
                </Text>
              </Section>

              <Section className="px-6 py-6">
                <Text className="m-0 text-[15px]" style={{ color: primary }}>
                  {invitedByName
                    ? `${invitedByName} ti ha invitato a entrare in ${companyName}.`
                    : `Sei stato invitato a entrare in ${companyName}.`}
                </Text>
                <Text className="m-0 mt-3 text-sm text-gray-600">
                  Clicca qui sotto per accettare l’invito e accedere al workspace.
                </Text>
                <Section className="mt-6">
                  <Button
                    href={inviteUrl}
                    className="rounded-xl px-6 py-3 text-[14px] font-semibold"
                    style={{
                      backgroundColor: accent,
                      color: primary,
                      border: `1px solid ${accent}`,
                    }}
                  >
                    Accetta invito
                  </Button>
                </Section>

                <Section className="mt-6 pt-6 border-t" style={{ borderColor: '#D8ECE7' }}>
                  <Img
                    src={footerLogo}
                    width="400"
                    height="108"
                    alt="Reglo"
                    className="w-full"
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                  />
                  <Text className="m-0 mt-2 text-xs text-gray-500 text-center">
                    Se non ti aspettavi questo invito, puoi ignorare questa email.
                  </Text>
                </Section>
              </Section>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
